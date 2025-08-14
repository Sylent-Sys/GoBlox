import * as THREE from 'three';
import { CAMERA_SHAKE_DECAY } from './Constants.ts';

export class FpsCamera {
	public readonly camera: THREE.PerspectiveCamera;
	private readonly anchor: THREE.Object3D;
    private shakeAmount = 0;
    private shakeDecay = CAMERA_SHAKE_DECAY;
	private tmpOffset = new THREE.Vector3();
    private baseOffset = new THREE.Vector3();
    private yawOffset = 0;

	constructor(fov = 75, aspect = 1, near = 0.1, far = 1000) {
		this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
		this.anchor = new THREE.Object3D();
		this.anchor.add(this.camera);
	}

	get object(): THREE.Object3D {
		return this.anchor;
	}

	setAspect(aspect: number): void {
		this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix();
	}

	setPosition(x: number, y: number, z: number): void {
		this.anchor.position.set(x, y, z);
	}

    setBaseOffset(offset: THREE.Vector3): void {
        this.baseOffset.copy(offset);
    }

    setYawOffset(offsetRadians: number): void {
        this.yawOffset = offsetRadians;
    }

    lookYawPitch(yawRadians: number, pitchRadians: number): void {
        this.anchor.rotation.set(0, yawRadians + this.yawOffset, 0, 'YXZ');
		this.camera.rotation.set(pitchRadians, 0, 0, 'YXZ');
	}

	addShake(intensity: number): void {
		this.shakeAmount = Math.max(this.shakeAmount, intensity);
	}

	update(dtSeconds: number): void {
		if (this.shakeAmount > 0) {
			this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeDecay * dtSeconds);
			this.tmpOffset.set(
				(Math.random() - 0.5) * this.shakeAmount * 0.02,
				(Math.random() - 0.5) * this.shakeAmount * 0.02,
				(Math.random() - 0.5) * this.shakeAmount * 0.02,
			);
            this.camera.position.copy(this.baseOffset).add(this.tmpOffset);
		} else {
            this.camera.position.copy(this.baseOffset);
		}
	}
}


