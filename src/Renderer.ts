import * as THREE from 'three';
import { debugLog } from './Debug.ts';

export class Renderer {
	public readonly renderer: THREE.WebGLRenderer;
	public readonly scene: THREE.Scene;

	constructor(container: HTMLElement, width: number, height: number) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setSize(width, height);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Improve shadow acne/flicker on large flat surfaces
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;

		container.appendChild(this.renderer.domElement);

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x87ceeb);
		debugLog('Renderer initialized', { pixelRatio: this.renderer.getPixelRatio?.(), size: { width, height } });
	}

	setSize(width: number, height: number) {
		this.renderer.setSize(width, height);
	}
}


