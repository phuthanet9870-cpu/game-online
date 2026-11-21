import * as THREE from "three";

/**
 * RO-style camera: looks down at the player from a fixed pitch, can be
 * rotated around the player (right-drag or Q/E) and zoomed (wheel).
 */
export class OrbitFollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = Math.PI / 4;
  private readonly pitch = THREE.MathUtils.degToRad(52);
  private distance = 20;
  private targetDistance = 20;
  private readonly focus = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.5, 300);
  }

  rotate(deltaRadians: number) {
    this.yaw += deltaRadians;
  }

  zoom(deltaY: number) {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * Math.exp(deltaY * 0.001), 10, 45);
  }

  /** Follow `target` smoothly; call once per frame. */
  update(target: THREE.Vector3, dt: number) {
    const k = 1 - Math.exp(-dt * 8);
    this.focus.lerp(target, k);
    this.distance += (this.targetDistance - this.distance) * k;
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.focus);
  }

  snapTo(target: THREE.Vector3) {
    this.focus.copy(target);
    this.update(target, 1);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
