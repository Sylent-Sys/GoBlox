import * as THREE from 'three';
import { FpsCamera } from './Camera.ts';
import { PhysicsSystem } from './PhysicsSystem.ts';
import type { PlayerPhysicsHandle } from './PhysicsSystem.ts';
import { debugLog } from './Debug.ts';
import { GobloxCharacter } from './Character.ts';
import {
    PLAYER_CAPSULE_HEIGHT,
    PLAYER_CAPSULE_RADIUS,
    PLAYER_EYE_OFFSET_FROM_CENTER,
    PLAYER_WALK_SPEED,
    PLAYER_SPRINT_SPEED,
    PLAYER_JUMP_VELOCITY,
    PLAYER_GROUND_ACCEL,
    PLAYER_AIR_ACCEL,
    PLAYER_MOUSE_SENSITIVITY,
    PLAYER_PITCH_LIMIT,
    PLAYER_LANDING_SHAKE_INTENSITY,
    PLAYER_SNAP_GROUND_EPSILON,
} from './Constants.ts';
import { TPS_CAMERA_OFFSET, VIEW_TOGGLE_KEY, BLOCK_RAYCAST_DISTANCE } from './Constants.ts';
import { VoxelWorld, BlockType } from './VoxelWorld.ts';
import type { BlockId } from './VoxelWorld.ts';

type MovementState = {
	forward: boolean;
	backward: boolean;
	left: boolean;
	right: boolean;
	jump: boolean;
	sprint: boolean;
};

export class PlayerController {
	public readonly camera: FpsCamera;
	private readonly physics: PhysicsSystem;
	private readonly handle: PlayerPhysicsHandle;
    private readonly capsuleHeight = PLAYER_CAPSULE_HEIGHT;
    private readonly capsuleRadius = PLAYER_CAPSULE_RADIUS;
	private eyeOffsetFromCenter: number;
    private readonly character: GobloxCharacter;

	private yaw = 0;
	private pitch = 0;
	private desiredMove = new THREE.Vector3();
	private readonly move: MovementState = { forward: false, backward: false, left: false, right: false, jump: false, sprint: false };
	private lastGrounded = true;
	private jumpQueued = false;
    private thirdPerson = false;
    private frontView = false;
    private enabled = true;

    constructor(physics: PhysicsSystem, camera: FpsCamera, spawn: THREE.Vector3, scene: THREE.Scene) {
		this.physics = physics;
		this.camera = camera;
		this.handle = physics.createPlayerCapsule(this.capsuleHeight, this.capsuleRadius, spawn);
        this.eyeOffsetFromCenter = PLAYER_EYE_OFFSET_FROM_CENTER;
        this.character = new GobloxCharacter(this.capsuleHeight);
        scene.add(this.character.object);

		// Snap to ground on spawn to avoid initial floating
        const feetOffset = (this.capsuleHeight * 0.5);
		const probeStart = new THREE.Vector3(spawn.x, spawn.y + 5, spawn.z);
		const groundY = this.physics.getSurfaceHeightBelow(probeStart);
		if (groundY !== undefined) {
            const targetY = groundY + feetOffset + PLAYER_SNAP_GROUND_EPSILON;
			this.handle.body.setTranslation({ x: spawn.x, y: targetY, z: spawn.z }, true);
		}

		const t = this.handle.body.translation();
		this.camera.setPosition(t.x, t.y + this.eyeOffsetFromCenter, t.z);
        this.applyViewMode();
	}

    private applyViewMode() {
        if (this.thirdPerson) {
            // Behind or front view depending on flag
			const offset = this.frontView ? new THREE.Vector3(0, 0, 3) : TPS_CAMERA_OFFSET;
			this.camera.setBaseOffset(offset);
            this.camera.setYawOffset(this.frontView ? Math.PI : 0);
        } else {
            this.camera.setBaseOffset(new THREE.Vector3(0, 0, 0));
            this.camera.setYawOffset(0);
        }
        this.character.setVisible(this.thirdPerson);
        debugLog('View mode set', { mode: this.thirdPerson ? (this.frontView ? 'TPS-FRONT' : 'TPS-BEHIND') : 'FPS' });
    }

    

    private toggleViewMode() {
        this.thirdPerson = !this.thirdPerson;
        this.applyViewMode();
    }

	attachInput(canvas: HTMLElement) {
		canvas.addEventListener('click', () => {
			canvas.requestPointerLock();
		});


		document.addEventListener('pointerlockchange', () => {
			const locked = document.pointerLockElement === canvas;
			debugLog('Pointer lock change', { locked });
		});

		document.addEventListener('mousemove', (e) => {
			if (document.pointerLockElement !== canvas) return;
            const sensitivity = PLAYER_MOUSE_SENSITIVITY;
            this.yaw -= e.movementX * sensitivity;
            this.pitch -= e.movementY * sensitivity;
            const pitchLimit = PLAYER_PITCH_LIMIT;
            this.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.pitch));
		});

        const setKey = (code: string, pressed: boolean) => {
			switch (code) {
				case 'KeyW': this.move.forward = pressed; break;
				case 'KeyS': this.move.backward = pressed; break;
				case 'KeyA': this.move.left = pressed; break;
				case 'KeyD': this.move.right = pressed; break;
				case 'Space':
					this.move.jump = pressed;
					if (pressed) this.jumpQueued = true;
					break;
				case 'ShiftLeft':
				case 'ShiftRight': this.move.sprint = pressed; break;
                case 'KeyC':
                    if (pressed) {
                        // Toggle front/behind when in TPS
                        if (this.thirdPerson) {
                            this.frontView = !this.frontView;
                            this.applyViewMode();
                        }
                    }
                    break;
			}
		};
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (e.code === VIEW_TOGGLE_KEY) {
                this.toggleViewMode();
                return;
            }
            setKey(e.code, true);
        });
		document.addEventListener('keyup', (e) => setKey(e.code, false));

		// Mouse block interactions
		canvas.addEventListener('contextmenu', (e) => e.preventDefault());
		document.addEventListener('mousedown', (e) => {
			if (document.pointerLockElement !== canvas) return;
			if (e.button === 0) {
				this.tryEditBlock(false);
			} else if (e.button === 2) {
				this.tryEditBlock(true);
			}
		});
	}

	update(dtSeconds: number) {
		if (!this.enabled) {
			this.camera.update(dtSeconds);
			return;
		}
		// camera look
		this.camera.lookYawPitch(this.yaw, this.pitch);

        // Keep base offset as set by view mode; no dynamic parabolic adjustment

		// move input relative to camera facing (projected on ground)
		this.desiredMove.set(0, 0, 0);
        const speed = this.move.sprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;

		const inputForward = (this.move.forward ? 1 : 0) + (this.move.backward ? -1 : 0);
		const inputRight = (this.move.right ? 1 : 0) + (this.move.left ? -1 : 0);

		const forward = new THREE.Vector3();
		this.camera.camera.getWorldDirection(forward);
		forward.y = 0;
		if (forward.lengthSq() > 0) forward.normalize(); else forward.set(0, 0, -1);

		const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

		this.desiredMove.addScaledVector(forward, inputForward);
		this.desiredMove.addScaledVector(right, inputRight);
		if (this.desiredMove.lengthSq() > 0) this.desiredMove.normalize().multiplyScalar(speed);

		const body = this.handle.body;
		const grounded = this.physics.isGrounded(body, this.capsuleHeight * 0.5 + PLAYER_SNAP_GROUND_EPSILON);

		// jump (edge-triggered)
		if (grounded && this.jumpQueued) {
			const linvel = body.linvel();
			body.setLinvel({ x: linvel.x, y: PLAYER_JUMP_VELOCITY, z: linvel.z }, true);
			debugLog('Player jump');
			this.jumpQueued = false;
		}

		// horizontal velocity control (accelerate toward desired)
		const linvel = body.linvel();
		const targetVX = this.desiredMove.x;
		const targetVZ = this.desiredMove.z;
        const accel = grounded ? PLAYER_GROUND_ACCEL : PLAYER_AIR_ACCEL;
		const newVX = THREE.MathUtils.damp(linvel.x, targetVX, accel, dtSeconds);
		const newVZ = THREE.MathUtils.damp(linvel.z, targetVZ, accel, dtSeconds);
		body.setLinvel({ x: newVX, y: linvel.y, z: newVZ }, true);

		// sync camera position to body
        const t = body.translation();
        this.camera.setPosition(t.x, t.y + this.eyeOffsetFromCenter, t.z);
		// sync character (feet at ground) and update simple walk animation
		const feetOffset = this.capsuleHeight * 0.5;
		this.character.setFeetPosition(t.x, t.y - feetOffset, t.z);
		this.character.setYawRadians(this.yaw);
		this.character.setHeadPitchRadians(this.pitch);
		const horizontalSpeed = Math.hypot(newVX, newVZ);
		this.character.updateAnimation(dtSeconds, horizontalSpeed);

		// landing shake
		if (!this.lastGrounded && grounded) {
			this.camera.addShake(PLAYER_LANDING_SHAKE_INTENSITY);
			debugLog('Player landed');
		}
		this.lastGrounded = grounded;

		this.camera.update(dtSeconds);

		// Update highlight on targeted block if a world is present on scene
		const sceneRef = (this as unknown as { __scene?: THREE.Scene }).__scene;
		const world = (sceneRef as unknown as { __world?: VoxelWorld })?.__world;
		if (world) {
			const ray = this.getViewRay();
			const hit = world.raycast(ray.origin, ray.direction, BLOCK_RAYCAST_DISTANCE);
			if (hit) {
				world.setHighlightAtCell(hit.gridX, hit.gridY, hit.gridZ);
			} else {
				world.clearHighlight();
			}
		}
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	getPositionY(): number {
		const t = this.handle.body.translation();
		return t.y;
	}

	respawn(spawn: THREE.Vector3): void {
		const feetOffset = this.capsuleHeight * 0.5;
		const probeStart = new THREE.Vector3(spawn.x, spawn.y + 5, spawn.z);
		const groundY = this.physics.getSurfaceHeightBelow(probeStart);
		let targetY = spawn.y;
		if (groundY !== undefined) {
			targetY = groundY + feetOffset + PLAYER_SNAP_GROUND_EPSILON;
		}
		this.handle.body.setTranslation({ x: spawn.x, y: targetY, z: spawn.z }, true);
		this.handle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
		this.handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		this.camera.setPosition(spawn.x, targetY + this.eyeOffsetFromCenter, spawn.z);
		this.character.setFeetPosition(spawn.x, targetY - feetOffset, spawn.z);
		this.enabled = true;
	}

	// Wire backreferences to allow player -> world access
	setSceneReferences(scene: THREE.Scene, world: VoxelWorld): void {
		(this as unknown as { __scene: THREE.Scene }).__scene = scene;
		(scene as unknown as { __world: VoxelWorld }).__world = world;
	}

	private getViewRay(): { origin: THREE.Vector3; direction: THREE.Vector3 } {
		const origin = new THREE.Vector3();
		origin.copy(this.camera.camera.getWorldPosition(new THREE.Vector3()));
		const dir = new THREE.Vector3();
		this.camera.camera.getWorldDirection(dir);
		return { origin, direction: dir.normalize() };
	}

	private tryEditBlock(place: boolean): void {
		const sceneRef = (this as unknown as { __scene?: THREE.Scene }).__scene;
		const world = (sceneRef as unknown as { __world?: VoxelWorld })?.__world;
		if (!world) return;
		const ray = this.getViewRay();
		const hit = world.raycast(ray.origin, ray.direction, BLOCK_RAYCAST_DISTANCE);
		if (!hit) return;
		if (!place) {
			// remove targeted block
			world.setBlock(hit.gridX, hit.gridY, hit.gridZ, BlockType.Air);
		} else {
			// place block on face
			const nx = Math.sign(hit.faceNormal.x);
			const ny = Math.sign(hit.faceNormal.y);
			const nz = Math.sign(hit.faceNormal.z);
			const px = hit.gridX + nx;
			const py = hit.gridY + ny;
			const pz = hit.gridZ + nz;
			const desired = (sceneRef as unknown as { __placeBlock?: BlockId }).__placeBlock ?? BlockType.Stone;
			world.setBlock(px, py, pz, desired as BlockId);
		}
	}
}


