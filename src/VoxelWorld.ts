import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d';
import { BLOCK_SIZE, BLOCK_RAYCAST_DISTANCE, WORLD_BLOCKS_X, WORLD_BLOCKS_Y, WORLD_BLOCKS_Z, WORLD_Y_LEVEL } from './Constants.ts';
import { PhysicsSystem } from './PhysicsSystem.ts';

export const BlockType = {
	Air: 0,
	Grass: 1,
	Dirt: 2,
    Stone: 3,
    Wood: 4,
} as const;
export type BlockId = (typeof BlockType)[keyof typeof BlockType];

type WorldDims = { x: number; y: number; z: number };

export type RaycastHit = {
	gridX: number;
	gridY: number;
	gridZ: number;
	faceNormal: THREE.Vector3; // integer vector
	distance: number;
};

export class VoxelWorld {
	public readonly dims: WorldDims;
	private readonly scene: THREE.Scene;
	private readonly physics: PhysicsSystem;

	// Grid origin offset (world position of local center (0,0,0))
	private readonly centerToWorld = new THREE.Vector3();

	private readonly data: Uint8Array;
	private readonly colliders: Array<Collider | null>;
	private readonly instanceIndex: Int32Array;

	private readonly materials: Record<number, THREE.MeshStandardMaterial>;
	private readonly meshes: Record<number, THREE.InstancedMesh>;
	private readonly counts: Record<number, number>;
	private readonly indexToCellByType: Record<number, number[]>; // maps inst idx -> linear cell idx, per type

	private readonly tempMatrix = new THREE.Matrix4();
	private readonly tempPos = new THREE.Vector3();

	private highlight: THREE.LineSegments | null = null;

	constructor(scene: THREE.Scene, physics: PhysicsSystem, dims: WorldDims = { x: WORLD_BLOCKS_X, y: WORLD_BLOCKS_Y, z: WORLD_BLOCKS_Z }) {
		this.scene = scene;
		this.physics = physics;
		this.dims = dims;

		// Center world around origin in XZ; Y anchored at WORLD_Y_LEVEL
		const minX = -Math.floor(dims.x / 2);
		const minZ = -Math.floor(dims.z / 2);
		this.centerToWorld.set(minX, WORLD_Y_LEVEL, minZ);

		const size = dims.x * dims.y * dims.z;
		this.data = new Uint8Array(size);
		this.colliders = new Array<Collider | null>(size).fill(null);
		this.instanceIndex = new Int32Array(size).fill(-1);

        const opaqueMat = (color: number) => new THREE.MeshStandardMaterial({
            color,
            roughness: 1.0,
            metalness: 0.0,
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,
        });
        this.materials = {
            [BlockType.Grass]: opaqueMat(0x55aa55),
            [BlockType.Dirt]: opaqueMat(0x8b5a2b),
            [BlockType.Stone]: opaqueMat(0x8b8b8b),
            [BlockType.Wood]: opaqueMat(0x8b6f47),
        } as Record<number, THREE.MeshStandardMaterial>;

		const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
		this.meshes = {} as Record<number, THREE.InstancedMesh>;
		this.counts = {} as Record<number, number>;
		this.indexToCellByType = {} as Record<number, number[]>;

        for (const t of [BlockType.Grass, BlockType.Dirt, BlockType.Stone, BlockType.Wood]) {
			const mesh = new THREE.InstancedMesh(geometry, this.materials[t], size);
			mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			mesh.count = 0;
			this.meshes[t] = mesh;
			this.counts[t] = 0;
			this.indexToCellByType[t] = [];
			this.scene.add(mesh);
		}

		this.createHighlight();
	}

	private toIndex(x: number, y: number, z: number): number {
		return x + this.dims.x * (y + this.dims.y * z);
	}

	private inBounds(x: number, y: number, z: number): boolean {
		return x >= 0 && x < this.dims.x && y >= 0 && y < this.dims.y && z >= 0 && z < this.dims.z;
	}

	getBlock(x: number, y: number, z: number): BlockId {
		if (!this.inBounds(x, y, z)) return BlockType.Air;
		return this.data[this.toIndex(x, y, z)] as BlockId;
	}

	setBlock(x: number, y: number, z: number, type: BlockId): boolean {
		if (!this.inBounds(x, y, z)) return false;
		const idx = this.toIndex(x, y, z);
		const prev = this.data[idx] as BlockId;
		if (prev === type) return true;

		if (prev !== BlockType.Air) {
			this.removeBlockInstance(idx, prev);
		}

		if (type !== BlockType.Air) {
			this.addBlockInstance(x, y, z, idx, type);
		}

		this.data[idx] = type;
		return true;
	}

	private gridToWorldCenter(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
		return out.set(x, y, z).add(this.centerToWorld);
	}

	private addBlockInstance(x: number, y: number, z: number, idx: number, type: BlockId): void {
		const mesh = this.meshes[type];
		const count = this.counts[type];
		this.gridToWorldCenter(x, y, z, this.tempPos);
		this.tempMatrix.makeTranslation(this.tempPos.x, this.tempPos.y, this.tempPos.z);
		mesh.setMatrixAt(count, this.tempMatrix);
		mesh.instanceMatrix.needsUpdate = true;
		this.indexToCellByType[type][count] = idx;
		this.instanceIndex[idx] = count;
		this.counts[type] = count + 1;
		mesh.count = this.counts[type];

		// physics collider
		const collider = this.physics.createStaticBlock(new THREE.Vector3(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), new THREE.Vector3(this.tempPos.x, this.tempPos.y, this.tempPos.z));
		this.colliders[idx] = collider;
	}

	private removeBlockInstance(idx: number, type: BlockId): void {
		const mesh = this.meshes[type];
		const count = this.counts[type];
		if (count <= 0) return;
		const instIdx = this.instanceIndex[idx];
		if (instIdx < 0) return;
		const lastInst = count - 1;
		if (instIdx !== lastInst) {
			// move last to removed slot
			mesh.getMatrixAt(lastInst, this.tempMatrix);
			mesh.setMatrixAt(instIdx, this.tempMatrix);
			const movedCellIdx = this.indexToCellByType[type][lastInst];
			this.indexToCellByType[type][instIdx] = movedCellIdx;
			this.instanceIndex[movedCellIdx] = instIdx;
		}
		// shrink
		this.indexToCellByType[type].length = lastInst;
		this.counts[type] = lastInst;
		mesh.count = lastInst;
		mesh.instanceMatrix.needsUpdate = true;
		this.instanceIndex[idx] = -1;

		// physics
		const col = this.colliders[idx];
		if (col) {
			this.physics.removeCollider(col);
			this.colliders[idx] = null;
		}
	}

	generateFlatWorld(baseY = 0): void {
		for (let x = 0; x < this.dims.x; x++) {
			for (let z = 0; z < this.dims.z; z++) {
				this.setBlock(x, baseY, z, BlockType.Grass);
			}
		}
	}

	private createHighlight(): void {
		const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(BLOCK_SIZE + 0.01, BLOCK_SIZE + 0.01, BLOCK_SIZE + 0.01));
        const mat = new THREE.LineBasicMaterial({ color: 0x000000, depthTest: false });
		const lines = new THREE.LineSegments(geo, mat);
		lines.visible = false;
		this.scene.add(lines);
		this.highlight = lines;
	}

	setHighlightAtCell(x: number, y: number, z: number): void {
		if (!this.highlight) return;
		this.gridToWorldCenter(x, y, z, this.tempPos);
		this.highlight.position.copy(this.tempPos);
		this.highlight.visible = true;
	}

	clearHighlight(): void {
		if (this.highlight) this.highlight.visible = false;
	}

	raycast(originWorld: THREE.Vector3, directionWorld: THREE.Vector3, maxDistance = BLOCK_RAYCAST_DISTANCE): RaycastHit | undefined {
		const dir = directionWorld.clone().normalize();
		const p = originWorld.clone().sub(this.centerToWorld); // local center space

		let ix = Math.floor(p.x + 0.5);
		let iy = Math.floor(p.y + 0.5);
		let iz = Math.floor(p.z + 0.5);

		const stepX = dir.x > 0 ? 1 : (dir.x < 0 ? -1 : 0);
		const stepY = dir.y > 0 ? 1 : (dir.y < 0 ? -1 : 0);
		const stepZ = dir.z > 0 ? 1 : (dir.z < 0 ? -1 : 0);

		const tDeltaX = stepX !== 0 ? 1 / Math.abs(dir.x) : Number.POSITIVE_INFINITY;
		const tDeltaY = stepY !== 0 ? 1 / Math.abs(dir.y) : Number.POSITIVE_INFINITY;
		const tDeltaZ = stepZ !== 0 ? 1 / Math.abs(dir.z) : Number.POSITIVE_INFINITY;

		const nextBoundary = (c: number, step: number, pCoord: number): number => {
			return step > 0 ? (c + 0.5 - pCoord) : (c - 0.5 - pCoord);
		};

		let tMaxX = stepX !== 0 ? nextBoundary(ix, stepX, p.x) / dir.x : Number.POSITIVE_INFINITY;
		let tMaxY = stepY !== 0 ? nextBoundary(iy, stepY, p.y) / dir.y : Number.POSITIVE_INFINITY;
		let tMaxZ = stepZ !== 0 ? nextBoundary(iz, stepZ, p.z) / dir.z : Number.POSITIVE_INFINITY;

		if (tMaxX < 0) tMaxX = 0; if (tMaxY < 0) tMaxY = 0; if (tMaxZ < 0) tMaxZ = 0;

		let dist = 0;
		const maxDist = maxDistance;

		// Keep track of which axis was used in the last step; this yields the correct face normal
		let lastStepX = 0;
		let lastStepY = 0;
		let lastStepZ = 0;

		// Iterate through grid cells along the ray
		for (let iter = 0; iter < 1024; iter++) {
			if (!this.inBounds(ix, iy, iz)) {
				// step into bounds if starting outside
				// advance to the nearest tMax and continue
				if (tMaxX < tMaxY) {
					if (tMaxX < tMaxZ) {
						dist = tMaxX; ix += stepX; tMaxX += tDeltaX; lastStepX = stepX; lastStepY = 0; lastStepZ = 0;
					} else {
						dist = tMaxZ; iz += stepZ; tMaxZ += tDeltaZ; lastStepX = 0; lastStepY = 0; lastStepZ = stepZ;
					}
				} else {
					if (tMaxY < tMaxZ) {
						dist = tMaxY; iy += stepY; tMaxY += tDeltaY; lastStepX = 0; lastStepY = stepY; lastStepZ = 0;
					} else {
						dist = tMaxZ; iz += stepZ; tMaxZ += tDeltaZ; lastStepX = 0; lastStepY = 0; lastStepZ = stepZ;
					}
				}
				if (dist > maxDist) return undefined;
				continue;
			}

			// Check cell
			const type = this.getBlock(ix, iy, iz);
			if (type !== BlockType.Air) {
				// Use last step axis to recover the entered face normal
				let normal = new THREE.Vector3();
				if (lastStepX !== 0 || lastStepY !== 0 || lastStepZ !== 0) {
					normal.set(-lastStepX, -lastStepY, -lastStepZ);
				} else {
					// Fallback (e.g., origin starts inside solid): derive from smallest tMax
					const tx = tMaxX; const ty = tMaxY; const tz = tMaxZ;
					const m = Math.min(tx, ty, tz);
					if (m === tx) normal.set(-stepX, 0, 0);
					else if (m === ty) normal.set(0, -stepY, 0);
					else normal.set(0, 0, -stepZ);
				}
				return { gridX: ix, gridY: iy, gridZ: iz, faceNormal: normal, distance: dist };
			}

			// advance to next cell
			if (tMaxX < tMaxY) {
				if (tMaxX < tMaxZ) {
					dist = tMaxX; ix += stepX; tMaxX += tDeltaX; lastStepX = stepX; lastStepY = 0; lastStepZ = 0;
				} else {
					dist = tMaxZ; iz += stepZ; tMaxZ += tDeltaZ; lastStepX = 0; lastStepY = 0; lastStepZ = stepZ;
				}
			} else {
				if (tMaxY < tMaxZ) {
					dist = tMaxY; iy += stepY; tMaxY += tDeltaY; lastStepX = 0; lastStepY = stepY; lastStepZ = 0;
				} else {
					dist = tMaxZ; iz += stepZ; tMaxZ += tDeltaZ; lastStepX = 0; lastStepY = 0; lastStepZ = stepZ;
				}
			}
			if (dist > maxDist) return undefined;
		}
		return undefined;
	}
}


