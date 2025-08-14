import * as THREE from 'three';
import RAPIER, { ColliderDesc, RigidBodyDesc } from '@dimforge/rapier3d';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d';
import { GRAVITY, GROUNDED_RAY_LENGTH, SURFACE_PROBE_MAX_DISTANCE } from './Constants.ts';
import { debugLog } from './Debug.ts';

export type PlayerPhysicsHandle = {
	body: RigidBody;
	collider: Collider;
};

export class PhysicsSystem {
	public readonly world: World;

	private constructor(world: World) {
		this.world = world;
	}

    static async create(gravity: THREE.Vector3 = GRAVITY): Promise<PhysicsSystem> {
		// Some typings of rapier may not expose init; call defensively.
		const maybeInit = (RAPIER as unknown as { init?: () => Promise<void> }).init;
		if (typeof maybeInit === 'function') {
			await maybeInit();
		}
		const world = new RAPIER.World({ x: gravity.x, y: gravity.y, z: gravity.z });
		debugLog('Rapier World created', { gravity });
		return new PhysicsSystem(world);
	}

	stepSimulation(fixedTimeStepSeconds: number, maxSubsteps: number, accumulator: { value: number }, dtSeconds: number): void {
		accumulator.value += dtSeconds;
		let substeps = 0;
		while (accumulator.value >= fixedTimeStepSeconds && substeps < maxSubsteps) {
			this.world.step();
			accumulator.value -= fixedTimeStepSeconds;
			substeps += 1;
		}
	}

	createStaticGround(size: THREE.Vector3, center: THREE.Vector3): Collider {
		const bodyDesc = RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
		const body = this.world.createRigidBody(bodyDesc);
		const colliderDesc = ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5);
		const collider = this.world.createCollider(colliderDesc, body);
		return collider;
	}

	createStaticBlock(size: THREE.Vector3, center: THREE.Vector3): Collider {
		const body = this.world.createRigidBody(RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
		const collider = this.world.createCollider(ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5), body);
		return collider;
	}

	createPlayerCapsule(height: number, radius: number, startPosition: THREE.Vector3): PlayerPhysicsHandle {
		const bodyDesc = RigidBodyDesc.dynamic()
			.setTranslation(startPosition.x, startPosition.y, startPosition.z)
			.setCanSleep(false)
			.lockRotations();
		const body = this.world.createRigidBody(bodyDesc);
		const halfHeight = Math.max(0, height * 0.5 - radius);
		const colliderDesc = ColliderDesc.capsule(halfHeight, radius)
			.setFriction(0.9)
			.setRestitution(0.0)
			.setDensity(30.0);
		const collider = this.world.createCollider(colliderDesc, body);
		const handle = { body, collider } as PlayerPhysicsHandle;
		const t = body.translation();
		debugLog('Player capsule created', { height, radius, start: startPosition, bodyPos: { x: t.x, y: t.y, z: t.z } });
		return handle;
	}

    getSurfaceHeightBelow(start: THREE.Vector3, maxDistance = SURFACE_PROBE_MAX_DISTANCE): number | undefined {
		const ray = new RAPIER.Ray({ x: start.x, y: start.y, z: start.z }, { x: 0, y: -1, z: 0 });
		const hit = this.world.castRay(ray, maxDistance, true);
		if (!hit) return undefined;
		const timeOfImpact = (hit as unknown as { timeOfImpact: number }).timeOfImpact;
		return start.y - timeOfImpact;
	}

    isGrounded(body: RigidBody, rayLength = GROUNDED_RAY_LENGTH): boolean {
		const origin = body.translation();
		const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: 0, y: -1, z: 0 });
		const hit = this.world.castRay(
			ray,
			rayLength,
			true,
			undefined,
			undefined,
			undefined,
			body
		);
		if (!hit) return false;
		const timeOfImpact = (hit as unknown as { timeOfImpact?: number }).timeOfImpact;
		return typeof timeOfImpact === 'number' && timeOfImpact <= rayLength + 1e-3;
	}
}


