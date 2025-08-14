import * as THREE from 'three';
import { PhysicsSystem } from './PhysicsSystem.ts';
import { SHADOW_MAP_SIZE } from './Constants.ts';
import { debugLog } from './Debug.ts';
import { VoxelWorld } from './VoxelWorld.ts';
import { Chicken } from './characters/Chicken.ts';

export class VoxelScene {
	public readonly threeScene: THREE.Scene;
	public readonly physics: PhysicsSystem;
	public readonly sun: THREE.DirectionalLight;
	public readonly ambient: THREE.AmbientLight;
    public readonly world: VoxelWorld;
    public readonly mobs: { chickens: Chicken[] } = { chickens: [] };

    private constructor(threeScene: THREE.Scene, physics: PhysicsSystem, sun: THREE.DirectionalLight, ambient: THREE.AmbientLight, world: VoxelWorld) {
		this.threeScene = threeScene;
		this.physics = physics;
		this.sun = sun;
		this.ambient = ambient;
        this.world = world;
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
        sun.shadow.bias = -0.0005;
        sun.shadow.normalBias = 0.02;
		baseScene.add(sun);

        // Create voxel world and generate flat ground
        const world = new VoxelWorld(baseScene, physics);
        world.generateFlatWorld(0);

        debugLog('VoxelScene world built: flat voxel ground');

        const scene = new VoxelScene(baseScene, physics, sun, ambient, world);
        // Expose world on scene for player access without circular deps
        (baseScene as unknown as { __world: VoxelWorld }).__world = world;
        // Spawn a few chickens near origin
        for (let i = 0; i < 5; i++) {
            const x = (Math.random() - 0.5) * 10;
            const z = (Math.random() - 0.5) * 10;
            const y = 2.0;
            const chicken = new Chicken(physics, baseScene, new THREE.Vector3(x, y, z));
            scene.mobs.chickens.push(chicken);
        }
        return scene;
	}
}


