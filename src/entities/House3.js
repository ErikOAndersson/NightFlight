// House3 model data extracted from House3.obj (Blender 4.2.0)
export const HOUSE3_MODEL = {
    // Vertices [x, y, z]
    vertices: [
        [        11,        7.5,         -3],  // v1
        [        11,          6,         -7],  // v2
        [        11,          6,          1],  // v3
        [        -1,        7.5,         -3],  // v4
        [        -1,          6,         -7],  // v5
        [        -1,          6,          1],  // v6
        [        10,          6,         -6],  // v7
        [        10,          0,         -6],  // v8
        [        10,          6,          0],  // v9
        [        10,          0,          0],  // v10
        [         0,          6,         -6],  // v11
        [         0,          0,         -6],  // v12
        [         0,          6,          0],  // v13
        [         0,          0,          0],  // v14
        [         5,    3.99999,          0],  // v15
        [         8,          4,          0],  // v16
        [         5,          0,          0],  // v17
        [         8,          0,          0],  // v18
        [      1.63,          4,          0],  // v19
        [      1.63,          2,          0],  // v20
        [      3.63,          4,          0],  // v21
        [      3.63,          2,          0],  // v22
    ],

    // Normals [nx, ny, nz]
    normals: [
        [     -0,  0.9363,  0.3511],  // n1
        [     -1,      -0,      -0],  // n2
        [      1,      -0,      -0],  // n3
        [     -0,  0.9363, -0.3511],  // n4
        [     -0,      -0,       1],  // n5
        [     -0,      -0,      -1],  // n6
        [     -0,      -1,      -0],  // n7
    ],

    // Faces - vertex indices (0-based), each face is an array of vertex indices
    faces: [
        [18, 20, 12],              // f1  - triangle
        [21, 14, 20],              // f2  - triangle
        [12, 11, 13],              // f3  - triangle
        [6, 9, 7],                 // f4  - triangle
        [10, 7, 11],               // f5  - triangle
        [17, 9, 15],               // f6  - triangle
        [9, 8, 15],                // f7  - triangle
        [13, 16, 19],              // f8  - triangle
        [16, 21, 19],              // f9  - triangle
        [20, 14, 12],              // f10  - triangle
        [14, 15, 8],               // f11  - triangle
        [13, 19, 12],              // f12  - triangle
        [19, 18, 12],              // f13  - triangle
        [14, 8, 12],               // f14  - triangle
        [21, 16, 14],              // f15  - triangle
        [12, 10, 11],              // f16  - triangle
        [6, 8, 9],                 // f17  - triangle
        [10, 6, 7],                // f18  - triangle
        [11, 9, 13],               // f19  - triangle
        [11, 7, 9],                // f20  - triangle
        [17, 14, 16],              // f21  - triangle
        [17, 15, 14],              // f22  - triangle
        [20, 19, 21],              // f23  - triangle
        [20, 18, 19],              // f24  - triangle
        [0, 5, 2],                 // f25  - triangle
        [5, 3, 4],                 // f26  - triangle
        [1, 0, 2],                 // f27  - triangle
        [3, 1, 4],                 // f28  - triangle
        [4, 12, 5],                // f29  - triangle
        [5, 8, 2],                 // f30  - triangle
        [4, 6, 10],                // f31  - triangle
        [8, 1, 2],                 // f32  - triangle
        [0, 3, 5],                 // f33  - triangle
        [3, 0, 1],                 // f34  - triangle
        [4, 10, 12],               // f35  - triangle
        [5, 12, 8],                // f36  - triangle
        [4, 1, 6],                 // f37  - triangle
        [8, 6, 1],                 // f38  - triangle
    ],

    // Face normals (0-based index into normals array, per face - flat shading)
    faceNormals: [
        4,   // f1
        4,   // f2
        1,   // f3
        2,   // f4
        5,   // f5
        4,   // f6
        4,   // f7
        4,   // f8
        4,   // f9
        4,   // f10
        4,   // f11
        4,   // f12
        4,   // f13
        4,   // f14
        4,   // f15
        1,   // f16
        2,   // f17
        5,   // f18
        6,   // f19
        6,   // f20
        4,   // f21
        4,   // f22
        4,   // f23
        4,   // f24
        0,   // f25
        1,   // f26
        2,   // f27
        3,   // f28
        6,   // f29
        6,   // f30
        6,   // f31
        6,   // f32
        0,   // f33
        3,   // f34
        6,   // f35
        6,   // f36
        6,   // f37
        6,   // f38
    ],

    // Edges derived from faces (0-based vertex index pairs, unique edges)
    edges: [
        [18, 20], [20, 12], [12, 18],
        [21, 14], [14, 20], [20, 21],
        [12, 11], [11, 13], [13, 12],
        [6, 9], [9, 7], [7, 6],
        [10, 7], [7, 11], [11, 10],
        [17, 9], [9, 15], [15, 17],
        [9, 8], [8, 15], [13, 16],
        [16, 19], [19, 13], [16, 21],
        [21, 19], [14, 12], [14, 15],
        [8, 14], [19, 12], [19, 18],
        [8, 12], [16, 14], [12, 10],
        [6, 8], [10, 6], [11, 9],
        [9, 13], [17, 14], [16, 17],
        [20, 19], [0, 5], [5, 2],
        [2, 0], [5, 3], [3, 4],
        [4, 5], [1, 0], [2, 1],
        [3, 1], [1, 4], [4, 12],
        [12, 5], [5, 8], [8, 2],
        [4, 6], [10, 4], [8, 1],
        [0, 3], [1, 6]
    ],

    // Per-face color overrides (face index -> [r, g, b], 0-255)
    // Faces not listed here use the model's default color
    faceColorOverrides: {
        18: [51, 51, 51],  // Material      [51, 51, 51]
        19: [51, 51, 51],  // Material      [51, 51, 51]
        20: [129, 69, 0],  // Material.002
        21: [129, 69, 0],  // Material.002
        22: [231, 211, 18],  // Material.003
        23: [231, 211, 18],  // Material.003
        24: [43, 43, 43],  // Material.004
        25: [43, 43, 43],  // Material.004
        26: [43, 43, 43],  // Material.004
        27: [43, 43, 43],  // Material.004
        28: [43, 43, 43],  // Material.004
        29: [43, 43, 43],  // Material.004
        30: [43, 43, 43],  // Material.004
        31: [43, 43, 43],  // Material.004
        32: [43, 43, 43],  // Material.004
        33: [43, 43, 43],  // Material.004
        34: [43, 43, 43],  // Material.004
        35: [43, 43, 43],  // Material.004
        36: [43, 43, 43],  // Material.004
        37: [43, 43, 43],  // Material.004
    },
};
