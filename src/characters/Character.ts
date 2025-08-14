import * as THREE from 'three';
import { PLAYER_CAPSULE_HEIGHT, PLAYER_WALK_SPEED } from '../Constants.ts';

export class GobloxCharacter {
    public readonly object: THREE.Group;
    private readonly materialSkin: THREE.MeshStandardMaterial;
    private readonly materialShirt: THREE.MeshStandardMaterial;
    private readonly materialPants: THREE.MeshStandardMaterial;

    // Body part references
    private leftLegPivot: THREE.Object3D;
    private rightLegPivot: THREE.Object3D;
    private leftArmPivot: THREE.Object3D;
    private rightArmPivot: THREE.Object3D;
    private torso: THREE.Mesh;
    private head: THREE.Mesh;
    private baseTorsoY!: number;
    private baseHeadY!: number;

    // Sizes
    private limbSize!: THREE.Vector3;
    private torsoSize!: THREE.Vector3;
    private legHeight!: number;
    private torsoHeight!: number;

    // Animation state
    private walkTime = 0;
    private lastSpeed = 0;
    private headPitchTarget = 0;
    private headPitchCurrent = 0;

    constructor(totalHeight = PLAYER_CAPSULE_HEIGHT) {
        this.object = new THREE.Group();
        this.object.name = 'GobloxCharacter';

        this.materialSkin = new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 0.9, metalness: 0.0 });
        this.materialShirt = new THREE.MeshStandardMaterial({ color: 0x3c8d2f, roughness: 0.9, metalness: 0.0 });
        this.materialPants = new THREE.MeshStandardMaterial({ color: 0x2d2f4f, roughness: 0.9, metalness: 0.0 });

        const S = totalHeight / 32; // Proportions: 8 (head) + 12 (torso) + 12 (legs)

        const headSize = new THREE.Vector3(8 * S, 8 * S, 8 * S);
        this.torsoSize = new THREE.Vector3(8 * S, 12 * S, 4 * S);
        this.limbSize = new THREE.Vector3(4 * S, 12 * S, 4 * S);

        this.legHeight = 12 * S;
        this.torsoHeight = 12 * S;

        const footY = 0;

        // Legs: create pivots at hip level, meshes offset down by half limb height
        const hipY = footY + this.legHeight;
        const legOffsetX = 2 * S;
        this.leftLegPivot = new THREE.Object3D();
        this.leftLegPivot.position.set(-legOffsetX, hipY, 0);
        const leftLegMesh = this.createBox(this.limbSize, this.materialPants);
        leftLegMesh.position.set(0, -this.limbSize.y * 0.5, 0);
        this.leftLegPivot.add(leftLegMesh);
        this.object.add(this.leftLegPivot);

        this.rightLegPivot = new THREE.Object3D();
        this.rightLegPivot.position.set(legOffsetX, hipY, 0);
        const rightLegMesh = this.createBox(this.limbSize, this.materialPants);
        rightLegMesh.position.set(0, -this.limbSize.y * 0.5, 0);
        this.rightLegPivot.add(rightLegMesh);
        this.object.add(this.rightLegPivot);

        // Torso (centered on top of legs)
        this.torso = this.createBox(this.torsoSize, this.materialShirt);
        this.baseTorsoY = footY + this.legHeight + this.torsoSize.y * 0.5;
        this.torso.position.set(0, this.baseTorsoY, 0);
        this.object.add(this.torso);

        // Arms: pivots at shoulder (top of torso)
        const shoulderY = footY + this.legHeight + this.torsoSize.y;
        const armOffsetX = this.torsoSize.x * 0.5 + this.limbSize.x * 0.5;

        this.leftArmPivot = new THREE.Object3D();
        this.leftArmPivot.position.set(-armOffsetX, shoulderY, 0);
        const leftArmMesh = this.createBox(this.limbSize, this.materialShirt);
        leftArmMesh.position.set(0, -this.limbSize.y * 0.5, 0);
        this.leftArmPivot.add(leftArmMesh);
        this.object.add(this.leftArmPivot);

        this.rightArmPivot = new THREE.Object3D();
        this.rightArmPivot.position.set(armOffsetX, shoulderY, 0);
        const rightArmMesh = this.createBox(this.limbSize, this.materialShirt);
        rightArmMesh.position.set(0, -this.limbSize.y * 0.5, 0);
        this.rightArmPivot.add(rightArmMesh);
        this.object.add(this.rightArmPivot);

        // Head
        this.head = this.createBox(headSize, this.materialSkin);
        this.baseHeadY = footY + this.legHeight + this.torsoHeight + headSize.y * 0.5;
        this.head.position.set(0, this.baseHeadY, 0);
        this.object.add(this.head);
    }

    setVisible(visible: boolean): void {
        this.object.visible = visible;
    }

    setFeetPosition(x: number, y: number, z: number): void {
        this.object.position.set(x, y, z);
    }

    setYawRadians(yaw: number): void {
        this.object.rotation.set(0, yaw, 0);
    }

    setHeadPitchRadians(pitch: number): void {
        // Scale and clamp so it looks natural
        const scaled = THREE.MathUtils.clamp(pitch * 0.75, -0.6, 0.6);
        this.headPitchTarget = scaled;
    }

    updateAnimation(dtSeconds: number, horizontalSpeed: number): void {
        // Smooth speed for nicer transitions
        const smoothing = 10;
        this.lastSpeed = THREE.MathUtils.damp(this.lastSpeed, horizontalSpeed, smoothing, dtSeconds);

        // Normalize relative to walk speed
        const speedNorm = THREE.MathUtils.clamp(this.lastSpeed / Math.max(0.001, PLAYER_WALK_SPEED), 0, 1);

        // Advance time proportionally to speed
        const baseFreq = 6.0; // rad/s when at walk speed
        const freq = baseFreq * (0.5 + 0.5 * speedNorm);
        this.walkTime += dtSeconds * freq;

        // Swing angles
        const swing = Math.sin(this.walkTime);
        const amplitudeLeg = THREE.MathUtils.lerp(0.0, 0.6, speedNorm);
        const amplitudeArm = THREE.MathUtils.lerp(0.0, 0.5, speedNorm);

        this.leftLegPivot.rotation.x = swing * amplitudeLeg;
        this.rightLegPivot.rotation.x = -swing * amplitudeLeg;

        this.leftArmPivot.rotation.x = -swing * amplitudeArm;
        this.rightArmPivot.rotation.x = swing * amplitudeArm;

        // Subtle torso and head bob
        const bobAmount = 0.02 * speedNorm;
        const bob = Math.abs(Math.cos(this.walkTime * 2.0)) * bobAmount; // always positive
        this.torso.position.y = this.baseTorsoY + bob;
        this.head.position.y = this.baseHeadY + bob * 0.6;

        // Smoothly apply head pitch to follow camera
        this.headPitchCurrent = THREE.MathUtils.damp(this.headPitchCurrent, this.headPitchTarget, 12, dtSeconds);
        this.head.rotation.x = this.headPitchCurrent;
    }

    private createBox(size: THREE.Vector3, material: THREE.MeshStandardMaterial): THREE.Mesh {
        const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mesh = new THREE.Mesh(geom, material);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        return mesh;
    }
}


