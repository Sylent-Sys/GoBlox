import * as THREE from 'three';
import { PhysicsSystem } from './PhysicsSystem.ts';
import { GROUND_SIZE, GROUND_CENTER, SHADOW_MAP_SIZE, BLOCK_SIZE, WORLD_Y_LEVEL } from './Constants.ts';
import { debugLog } from './Debug.ts';

export class VoxelScene {
	public readonly threeScene: THREE.Scene;
	public readonly physics: PhysicsSystem;
	public readonly sun: THREE.DirectionalLight;
	public readonly ambient: THREE.AmbientLight;

	private constructor(threeScene: THREE.Scene, physics: PhysicsSystem, sun: THREE.DirectionalLight, ambient: THREE.AmbientLight) {
		this.threeScene = threeScene;
		this.physics = physics;
		this.sun = sun;
		this.ambient = ambient;
	}

	static async create(baseScene: THREE.Scene): Promise<VoxelScene> {
		const physics = await PhysicsSystem.create();
		debugLog('PhysicsSystem created');

		const ambient = new THREE.AmbientLight(0xffffff, 0.4);
		baseScene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(5, 10, 4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
		baseScene.add(sun);

        // ground plane (as voxel-sized block), aligned so top surface sits at Y = WORLD_Y_LEVEL
        const groundSize = GROUND_SIZE;
        const groundCenter = GROUND_CENTER;
        physics.createStaticGround(groundSize, groundCenter);

        const groundGeom = new THREE.BoxGeometry(groundSize.x, groundSize.y, groundSize.z);
		const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa55 });
		const groundMesh = new THREE.Mesh(groundGeom, groundMat);
		groundMesh.position.copy(groundCenter);
		groundMesh.receiveShadow = true;
		baseScene.add(groundMesh);

		// a few voxel blocks to look at
        const blockMat = new THREE.MeshStandardMaterial({ color: 0x8b8b8b });
        const blockGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
		for (let x = -4; x <= 4; x += 2) {
			for (let z = -4; z <= 4; z += 2) {
                const y = WORLD_Y_LEVEL + 1;
				const mesh = new THREE.Mesh(blockGeo, blockMat);
				mesh.position.set(x, y, z);
				mesh.castShadow = true;
				baseScene.add(mesh);
                physics.createStaticBlock(new THREE.Vector3(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), new THREE.Vector3(x, y, z));
			}
		}

		debugLog('VoxelScene geometry built: ground and blocks added');

		return new VoxelScene(baseScene, physics, sun, ambient);
	}
}


