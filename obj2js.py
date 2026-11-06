#!/usr/bin/env python3
"""
Convert Wavefront .obj files to .js model files.

Usage:
    python obj2js.py model.obj
    python obj2js.py model.obj --name MY_MODEL
    python obj2js.py *.obj

Output .js files match the format used by ship.js / rock.js:
  - vertices, normals, faces (0-based), faceNormals, edges
  - faceNormals are per-vertex arrays when normals vary within a face,
    or flat (single index per face) when all vertices share one normal.
"""

import sys
import os
import re
import glob
import argparse


def parse_mtl(filepath):
    """Parse a Wavefront .mtl file and return a dict of material_name -> Kd (r, g, b) in 0-255."""
    materials = {}
    current = None

    if not os.path.isfile(filepath):
        return materials

    with open(filepath, "r") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts[0] == "newmtl":
                current = " ".join(parts[1:])
            elif parts[0] == "Kd" and current and len(parts) >= 4:
                r = int(round(float(parts[1]) * 255))
                g = int(round(float(parts[2]) * 255))
                b = int(round(float(parts[3]) * 255))
                materials[current] = (r, g, b)

    return materials


def parse_obj(filepath):
    """Parse a Wavefront .obj file and return vertices, normals, faces, and per-face materials."""
    vertices = []
    normals = []
    faces = []  # list of [(vi, ni), ...] per face  (1-based from OBJ)
    face_materials = []  # material name for each face (or None)
    mtl_file = None
    current_material = None

    with open(filepath, "r") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            keyword = parts[0]

            if keyword == "mtllib" and len(parts) >= 2:
                mtl_file = " ".join(parts[1:])

            elif keyword == "usemtl" and len(parts) >= 2:
                current_material = " ".join(parts[1:])

            elif keyword == "v" and len(parts) >= 4:
                vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))

            elif keyword == "vn" and len(parts) >= 4:
                normals.append((float(parts[1]), float(parts[2]), float(parts[3])))

            elif keyword == "f":
                face_verts = []
                for token in parts[1:]:
                    # Formats: v, v/vt, v/vt/vn, v//vn
                    indices = token.split("/")
                    vi = int(indices[0])
                    ni = int(indices[2]) if len(indices) >= 3 and indices[2] else 0
                    face_verts.append((vi, ni))
                faces.append(face_verts)
                face_materials.append(current_material)

    return vertices, normals, faces, face_materials, mtl_file


def derive_edges(faces_0based):
    """Extract unique undirected edges from 0-based face vertex lists."""
    seen = set()
    edges = []
    for face in faces_0based:
        n = len(face)
        for i in range(n):
            a = face[i]
            b = face[(i + 1) % n]
            key = (min(a, b), max(a, b))
            if key not in seen:
                seen.add(key)
                edges.append([a, b])
    return edges


def format_float(v):
    """Format a float for JS output, keeping up to 6 decimal places."""
    s = f"{v:.6f}"
    # Strip trailing zeros but keep at least one decimal place
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    # Keep the sign aligned: positive numbers get a leading space only when
    # we want alignment (handled in the array formatting instead).
    return s


def convert(filepath, const_name=None):
    """Convert a single .obj file to a .js string."""
    vertices, normals, faces_raw, face_materials, mtl_file = parse_obj(filepath)

    # Parse companion .mtl file for material colors
    materials = {}
    if mtl_file:
        mtl_path = os.path.join(os.path.dirname(filepath), mtl_file)
        materials = parse_mtl(mtl_path)

    basename = os.path.splitext(os.path.basename(filepath))[0]
    blender_tag = ""
    with open(filepath, "r") as f:
        for line in f:
            if line.startswith("# Blender"):
                blender_tag = line.strip().replace("# ", "")
                break

    if const_name is None:
        const_name = re.sub(r"[^A-Za-z0-9]", "_", basename).upper() + "_MODEL"

    # Build 0-based face vertex and normal index lists
    faces_0 = []          # each entry: list of 0-based vertex indices
    face_normals_raw = []  # each entry: list of 0-based normal indices (per vertex)

    for face in faces_raw:
        vis = [vi - 1 for vi, ni in face]
        nis = [ni - 1 for vi, ni in face if ni > 0]
        faces_0.append(vis)
        face_normals_raw.append(nis)

    # Determine if flat shading (all normals identical per face)
    has_normals = normals and all(len(fn) == len(f) for f, fn in zip(faces_0, face_normals_raw))
    is_flat = has_normals and all(
        len(set(fn)) == 1 for fn in face_normals_raw if fn
    )

    edges = derive_edges(faces_0)

    # ---- Build output ----
    lines = []
    source = f"{basename}.obj"
    if blender_tag:
        source += f" ({blender_tag})"
    lines.append(f"// {basename.capitalize()} model data extracted from {source}")
    lines.append(f"const {const_name} = {{")

    # -- Vertices --
    lines.append("    // Vertices [x, y, z]")
    lines.append("    vertices: [")
    for i, (x, y, z) in enumerate(vertices):
        lines.append(f"        [{format_float(x):>10}, {format_float(y):>10}, {format_float(z):>10}],  // v{i + 1}")
    lines.append("    ],")
    lines.append("")

    # -- Normals --
    if normals:
        lines.append("    // Normals [nx, ny, nz]")
        lines.append("    normals: [")
        for i, (nx, ny, nz) in enumerate(normals):
            lines.append(f"        [{format_float(nx):>7s}, {format_float(ny):>7s}, {format_float(nz):>7s}],  // n{i + 1}")
        lines.append("    ],")
        lines.append("")

    # -- Faces --
    lines.append("    // Faces - vertex indices (0-based), each face is an array of vertex indices")
    lines.append("    faces: [")
    shape_names = {3: "triangle", 4: "quad", 5: "pentagon", 6: "hexagon"}
    for i, face in enumerate(faces_0):
        idx_str = ", ".join(str(v) for v in face)
        shape = shape_names.get(len(face), f"{len(face)}-gon")
        lines.append(f"        [{idx_str}],{' ' * max(1, 24 - len(idx_str))}// f{i + 1}  - {shape}")
    lines.append("    ],")
    lines.append("")

    # -- Face normals --
    if has_normals:
        if is_flat:
            lines.append("    // Face normals (0-based index into normals array, per face - flat shading)")
            lines.append("    faceNormals: [")
            for i, fn in enumerate(face_normals_raw):
                lines.append(f"        {fn[0]},{' ' * max(1, 4 - len(str(fn[0])))}// f{i + 1}")
            lines.append("    ],")
        else:
            lines.append("    // Face normals (0-based index into normals array, per vertex per face)")
            lines.append("    faceNormals: [")
            for i, fn in enumerate(face_normals_raw):
                idx_str = ", ".join(str(n) for n in fn)
                lines.append(f"        [{idx_str}],{' ' * max(1, 24 - len(idx_str))}// f{i + 1}")
            lines.append("    ],")
        lines.append("")

    # -- Edges --
    lines.append("    // Edges derived from faces (0-based vertex index pairs, unique edges)")
    lines.append("    edges: [")
    # Group edges by source face for readability
    edge_strs = []
    for a, b in edges:
        edge_strs.append(f"[{a}, {b}]")
    # Print ~3 edges per line for compactness
    for i in range(0, len(edge_strs), 3):
        chunk = ", ".join(edge_strs[i : i + 3])
        comma = "," if i + 3 < len(edge_strs) else ""
        lines.append(f"        {chunk}{comma}")
    lines.append("    ],")

    # -- Face color overrides (from .mtl materials) --
    if materials and face_materials:
        # Determine the default material: the first one used, or None (no usemtl)
        default_mat = None
        for mat in face_materials:
            if mat is not None:
                default_mat = mat
                break

        # Build overrides for faces that differ from the default
        overrides = {}
        for i, mat in enumerate(face_materials):
            if mat and mat != default_mat and mat in materials:
                overrides[i] = materials[mat]

        if overrides:
            lines.append("")
            lines.append("    // Per-face color overrides (face index -> [r, g, b], 0-255)")
            lines.append("    // Faces not listed here use the model's default color")
            lines.append("    faceColorOverrides: {")
            for face_idx in sorted(overrides.keys()):
                r, g, b = overrides[face_idx]
                mat_name = face_materials[face_idx]
                lines.append(f"        {face_idx}: [{r}, {g}, {b}],  // {mat_name}")
            lines.append("    },")

    lines.append("};")
    lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Convert .obj files to .js model files")
    parser.add_argument("files", nargs="+", help="One or more .obj files (glob patterns accepted)")
    parser.add_argument("--name", default=None, help="JS const name (default: derived from filename)")
    args = parser.parse_args()

    # Expand globs on Windows
    paths = []
    for pattern in args.files:
        expanded = glob.glob(pattern)
        if expanded:
            paths.extend(expanded)
        else:
            paths.append(pattern)

    for path in paths:
        if not os.path.isfile(path):
            print(f"Warning: {path} not found, skipping.", file=sys.stderr)
            continue

        name_override = args.name if len(paths) == 1 else None
        js_content = convert(path, name_override)

        out_path = os.path.splitext(path)[0] + ".js"
        with open(out_path, "w", newline="\n") as f:
            f.write(js_content)

        print(f"Converted {path} -> {out_path}")


if __name__ == "__main__":
    main()
