import * as THREE from 'three';

export class ThirdPersonCameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Orbit Spherical coordinates
    this.distance = 8.5; // Default distance behind boat
    this.minDistance = 5.0; // STRICT MIN ZOOM
    this.maxDistance = 12.0; // STRICT MAX ZOOM

    this.azimuthAngle = Math.PI; // horizontal orbit angle (radians)
    this.elevationAngle = 0.45;  // vertical elevation angle (radians)

    this.minElevation = 0.12;  // ~7 degrees above water
    this.maxElevation = 1.25;  // ~72 degrees overhead

    // Target offset relative to boat origin
    this.targetOffset = new THREE.Vector3(0, 1.8, 0);

    // Mouse drag state
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };

    this.raycaster = new THREE.Raycaster();

    this.initEvents();
  }

  initEvents() {
    this.handlePointerDown = (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    this.handlePointerMove = (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      const sensitivity = 0.005;
      this.azimuthAngle -= deltaX * sensitivity;
      this.elevationAngle += deltaY * sensitivity;

      // Clamp elevation so camera never goes below water or flips overhead
      this.elevationAngle = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevationAngle));

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    this.handlePointerUp = () => {
      this.isDragging = false;
    };

    this.handleWheel = (e) => {
      e.preventDefault();
      const zoomSensitivity = 0.008;
      this.distance += e.deltaY * zoomSensitivity;

      // STRICTLY ENFORCE ZOOM LIMITS (5.0 <= distance <= 12.0)
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    };

    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  update(boatPosition, boatYaw, delta = 1 / 60) {
    if (!boatPosition) return;

    // Target position (centered on boat)
    const target = boatPosition.clone().add(this.targetOffset);

    // Calculate ideal camera position relative to target based on orbit angles
    const x = this.distance * Math.cos(this.elevationAngle) * Math.sin(this.azimuthAngle);
    const y = this.distance * Math.sin(this.elevationAngle);
    const z = this.distance * Math.cos(this.elevationAngle) * Math.cos(this.azimuthAngle);

    let cameraPos = target.clone().add(new THREE.Vector3(x, y, z));

    // Water height safeguard (camera y must never drop below 1.0)
    if (cameraPos.y < 1.0) {
      cameraPos.y = 1.0;
    }

    // Camera Collision Raycast Check
    const rayDir = cameraPos.clone().sub(target).normalize();
    const rayDist = cameraPos.distanceTo(target);
    this.raycaster.set(target, rayDir);

    // Smoothly lerp camera position to avoid camera jitter
    this.camera.position.lerp(cameraPos, 0.15);
    this.camera.lookAt(target);
  }

  destroy() {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('wheel', this.handleWheel);
  }
}
