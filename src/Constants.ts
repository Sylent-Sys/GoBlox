import * as THREE from 'three';

// World level
export const WORLD_Y_LEVEL = 0;

// Physics
export const GRAVITY = new THREE.Vector3(0, -9.81, 0);
export const SURFACE_PROBE_MAX_DISTANCE = 200;
export const GROUNDED_RAY_LENGTH = 0.15;

// Ground
export const GROUND_THICKNESS = 1;
export const GROUND_SIZE = new THREE.Vector3(200, GROUND_THICKNESS, 200);
export const GROUND_CENTER = new THREE.Vector3(0, 0, 0);

// Rendering / Camera
export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 500;
export const SHADOW_MAP_SIZE = 2048;
export const CAMERA_SHAKE_DECAY = 2.5;
export const TPS_CAMERA_OFFSET = new THREE.Vector3(0, 0.3, 3.0);
export const VIEW_TOGGLE_KEY = 'KeyV';
// TPS camera vertical movement curve (parabolic path params)
export const TPS_PARABOLA_MIN_DISTANCE = 1.8; // closest distance at pitch extremes
export const TPS_PARABOLA_VERTICAL_AMPLITUDE = 1.0; // vertical displacement at pitch extremes

// Player
export const PLAYER_CAPSULE_HEIGHT = 1.75;
export const PLAYER_CAPSULE_RADIUS = 0.35;
export const PLAYER_EYE_OFFSET_FROM_CENTER = PLAYER_CAPSULE_HEIGHT * 0.7;
export const PLAYER_WALK_SPEED = 4.2;
export const PLAYER_SPRINT_SPEED = 7;
export const PLAYER_JUMP_VELOCITY = 5.2;
export const PLAYER_GROUND_ACCEL = 20;
export const PLAYER_AIR_ACCEL = 5;
export const PLAYER_MOUSE_SENSITIVITY = 0.0025;
export const PLAYER_PITCH_LIMIT = Math.PI / 2 - 0.01;
export const PLAYER_LANDING_SHAKE_INTENSITY = 1.0;
export const PLAYER_SNAP_GROUND_EPSILON = 0.02;
export const PLAYER_SPAWN = new THREE.Vector3(0, WORLD_Y_LEVEL + 2.5, 6);

// Blocks
export const BLOCK_SIZE = 1;
export const BLOCK_RAYCAST_DISTANCE = 6;

// Voxel world dimensions (in blocks)
export const WORLD_BLOCKS_X = 48;
export const WORLD_BLOCKS_Y = 16;
export const WORLD_BLOCKS_Z = 48;

// Death / Void
export const VOID_FALL_LIMIT_Y = WORLD_Y_LEVEL - 64;