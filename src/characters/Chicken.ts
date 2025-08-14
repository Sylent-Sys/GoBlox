import * as THREE from 'three';
import type { RigidBody } from '@dimforge/rapier3d';
import { PhysicsSystem } from '../PhysicsSystem.ts';

export class Chicken {
	public readonly object: THREE.Group;
	private readonly physics: PhysicsSystem;
    private readonly body: RigidBody;
	private readonly capsuleHeight: number;
	private readonly capsuleRadius: number;

	// Visual parts
	private bodyMesh!: THREE.Mesh;
	private headPivot!: THREE.Object3D;
	private headMesh!: THREE.Mesh;
	private beakMesh!: THREE.Mesh;
	private combMesh!: THREE.Mesh;
	private legLPivot!: THREE.Object3D;
	private legRPivot!: THREE.Object3D;
	private wingLPivot!: THREE.Object3D;
	private wingRPivot!: THREE.Object3D;
	private readonly baseBodyY = 0.35;
	private readonly baseHeadPivotY = 0.58;

	private readonly speedWalk = 1.2;
	private readonly speedRun = 1.8;
	private desiredMoveDir = new THREE.Vector3();
	private changeDirTimer = 0;
	private idleTimer = 0;

	private readonly tempVec3 = new THREE.Vector3();

	// Animation state
	private animWalkTime = 0;
	private smoothedSpeed = 0;
	private peckTimer = 0;
	private peckCooldown = 0;
	private flapTimer = 0;
	private flapCooldown = 0;

	constructor(physics: PhysicsSystem, scene: THREE.Scene, spawn: THREE.Vector3) {
		this.physics = physics;
		this.object = new THREE.Group();
		this.object.name = 'Chicken';

		// Visual: blocky chicken with animatable parts
		const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
		const yellow = new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 1, metalness: 0 });
		const red = new THREE.MeshStandardMaterial({ color: 0xff5555, roughness: 1, metalness: 0 });

		this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.6), white);
		this.bodyMesh.castShadow = true;
		this.bodyMesh.position.set(0, this.baseBodyY, 0);
		this.object.add(this.bodyMesh);

		this.headPivot = new THREE.Object3D();
		this.headPivot.position.set(0, this.baseHeadPivotY, 0.23);
		this.object.add(this.headPivot);
		this.headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), white);
		this.headMesh.castShadow = true;
		this.headMesh.position.set(0, 0.125, 0);
		this.headPivot.add(this.headMesh);

		this.beakMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.12), yellow);
		this.beakMesh.castShadow = true;
		this.beakMesh.position.set(0, 0.06, 0.24);
		this.headPivot.add(this.beakMesh);

		this.combMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.12), red);
		this.combMesh.castShadow = true;
		this.combMesh.position.set(0, 0.2, 0.1);
		this.headPivot.add(this.combMesh);

		this.legLPivot = new THREE.Object3D();
		this.legLPivot.position.set(-0.1, 0.25, 0.1);
		this.object.add(this.legLPivot);
		const legL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), yellow);
		legL.castShadow = true;
		legL.position.set(0, -0.125, 0);
		this.legLPivot.add(legL);

		this.legRPivot = new THREE.Object3D();
		this.legRPivot.position.set(0.1, 0.25, 0.1);
		this.object.add(this.legRPivot);
		const legR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), yellow);
		legR.castShadow = true;
		legR.position.set(0, -0.125, 0);
		this.legRPivot.add(legR);

		this.wingLPivot = new THREE.Object3D();
		this.wingLPivot.position.set(-0.26, 0.45, 0);
		this.object.add(this.wingLPivot);
		const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.35), white);
		wingL.castShadow = true;
		wingL.position.set(0, -0.05, 0);
		this.wingLPivot.add(wingL);

		this.wingRPivot = new THREE.Object3D();
		this.wingRPivot.position.set(0.26, 0.45, 0);
		this.object.add(this.wingRPivot);
		const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.35), white);
		wingR.castShadow = true;
		wingR.position.set(0, -0.05, 0);
		this.wingRPivot.add(wingR);

		// Physics capsule roughly matching size
		this.capsuleHeight = 0.7;
		this.capsuleRadius = 0.18;
        const { body: rb } = physics.createDynamicCapsule(
			this.capsuleHeight,
			this.capsuleRadius,
			spawn.clone(),
			{ friction: 0.7, restitution: 0.0, density: 8.0, lockRotations: true, canSleep: true }
		);
		this.body = rb;

		// Snap closer to ground at spawn
		const feetOffset = this.capsuleHeight * 0.5;
		const probe = spawn.clone();
		probe.y += 5;
		const groundY = physics.getSurfaceHeightBelow(probe);
		if (groundY !== undefined) {
			this.body.setTranslation({ x: spawn.x, y: groundY + feetOffset, z: spawn.z }, true);
		}

		// Initial position of visual (feet at ground)
		const t = this.body.translation();
		this.object.position.set(t.x, t.y - feetOffset, t.z);

		scene.add(this.object);
		this.pickNewDirection();
		this.resetPeckCooldown();
		this.resetFlapCooldown();
	}

	update(dtSeconds: number): void {
		// Randomly idle sometimes
		if (this.idleTimer > 0) {
			this.idleTimer -= dtSeconds;
			this.applyMovement(dtSeconds, 0);
			this.syncVisual();
			return;
		}

		this.changeDirTimer -= dtSeconds;
		if (this.changeDirTimer <= 0) {
			this.pickNewDirection();
		}

		// Basic ledge avoidance: look slightly ahead and sample ground drop
		const bodyT = this.body.translation();
		this.tempVec3.set(bodyT.x, bodyT.y + 0.5, bodyT.z).addScaledVector(this.desiredMoveDir, 0.6);
		const groundAhead = this.physics.getSurfaceHeightBelow(this.tempVec3);
		if (groundAhead === undefined || (bodyT.y - groundAhead) > 0.6) {
			// Too steep or no ground: turn away
			this.desiredMoveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() * 0.5 + 0.5) * Math.PI);
		}

		const grounded = this.physics.isGrounded(this.body);
		const speed = grounded ? this.speedWalk : this.speedRun;
		this.applyMovement(dtSeconds, speed);
		this.syncVisual();
		this.updateAnimation(dtSeconds);
	}

	private applyMovement(dtSeconds: number, speed: number): void {
		const lin = this.body.linvel();
		const targetVX = this.desiredMoveDir.x * speed;
		const targetVZ = this.desiredMoveDir.z * speed;
		const accel = 6.0; // gentle acceleration for small mob
		const newVX = THREE.MathUtils.damp(lin.x, targetVX, accel, dtSeconds);
		const newVZ = THREE.MathUtils.damp(lin.z, targetVZ, accel, dtSeconds);
		this.body.setLinvel({ x: newVX, y: lin.y, z: newVZ }, true);
	}

	private syncVisual(): void {
		const t = this.body.translation();
		const feetOffset = this.capsuleHeight * 0.5;
		this.object.position.set(t.x, t.y - feetOffset, t.z);
		// Face movement direction if moving
		const lin = this.body.linvel();
		const hspeed = Math.hypot(lin.x, lin.z);
		if (hspeed > 0.05) {
			const yaw = Math.atan2(lin.x, lin.z);
			this.object.rotation.set(0, yaw, 0);
		}
	}

	private pickNewDirection(): void {
		if (Math.random() < 0.25) {
			// Idle for a short while
			this.idleTimer = 0.6 + Math.random() * 1.0;
			this.changeDirTimer = 0.5 + Math.random() * 1.0;
			this.desiredMoveDir.set(0, 0, 0);
			return;
		}
		const angle = Math.random() * Math.PI * 2;
		this.desiredMoveDir.set(Math.sin(angle), 0, Math.cos(angle));
		this.changeDirTimer = 1.5 + Math.random() * 2.0;
	}

	private resetPeckCooldown(): void {
		this.peckCooldown = 1.5 + Math.random() * 3.0;
	}

	private resetFlapCooldown(): void {
		this.flapCooldown = 2.0 + Math.random() * 4.0;
	}

	private updateAnimation(dtSeconds: number): void {
		const lin = this.body.linvel();
		const hspeed = Math.hypot(lin.x, lin.z);
		this.smoothedSpeed = THREE.MathUtils.damp(this.smoothedSpeed, hspeed, 10, dtSeconds);
		const speedNorm = THREE.MathUtils.clamp(this.smoothedSpeed / this.speedWalk, 0, 1);

		this.animWalkTime += dtSeconds * (4.0 + 4.0 * speedNorm) * speedNorm;
		const swing = Math.sin(this.animWalkTime);
		const legAmp = THREE.MathUtils.lerp(0, 0.8, speedNorm);
		this.legLPivot.rotation.x = swing * legAmp;
		this.legRPivot.rotation.x = -swing * legAmp;

		const bob = Math.abs(Math.cos(this.animWalkTime * 2.0)) * 0.02 * speedNorm;
		this.bodyMesh.position.y = this.baseBodyY + bob;
		this.headPivot.position.y = this.baseHeadPivotY + bob * 0.6;

		if (this.peckTimer > 0) {
			this.peckTimer -= dtSeconds;
			const d = Math.max(0, Math.min(1, 1 - this.peckTimer / 0.6));
			let a = 0;
			if (d < 0.5) a = -THREE.MathUtils.lerp(0, 1.0, d / 0.5);
			else a = -THREE.MathUtils.lerp(1.0, 0, (d - 0.5) / 0.5);
			this.headPivot.rotation.x = a;
		} else {
			this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, 0, 8, dtSeconds);
			this.peckCooldown -= dtSeconds;
			if (this.peckCooldown <= 0 && this.smoothedSpeed < 0.2 && this.idleTimer > 0) {
				this.peckTimer = 0.6;
				this.resetPeckCooldown();
			}
		}

		if (this.flapTimer > 0) {
			this.flapTimer -= dtSeconds;
			const t = 1 - this.flapTimer / 0.7;
			const flap = Math.sin(t * Math.PI * 3) * 0.9;
			this.wingLPivot.rotation.z = flap;
			this.wingRPivot.rotation.z = -flap;
		} else {
			this.wingLPivot.rotation.z = THREE.MathUtils.damp(this.wingLPivot.rotation.z, 0, 10, dtSeconds);
			this.wingRPivot.rotation.z = THREE.MathUtils.damp(this.wingRPivot.rotation.z, 0, 10, dtSeconds);
			this.flapCooldown -= dtSeconds;
			if (this.flapCooldown <= 0 && Math.random() < 0.1 + (this.idleTimer > 0 ? 0.2 : 0)) {
				this.flapTimer = 0.7;
				this.resetFlapCooldown();
			}
		}
	}
}


