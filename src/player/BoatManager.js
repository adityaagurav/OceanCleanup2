import * as THREE from 'three';

import boat1 from '../../assets/boat/fishing_boat.glb?url';
import boat2 from '../../assets/boat/boat with hanger.glb?url';
import boat3 from '../../assets/boat/scene.gltf?url';
import boat4 from '../../assets/boat/post_apocalyptic_house_boat.glb?url';

export const BOAT_LEVELS = [
  { level: 1, trashNeeded: 0,  slots: 20,  speed: 12, name: 'Small Fishing Boat', glb: boat1, scale: 1.5, color: 0xE8E8E8 },
  { level: 2, trashNeeded: 5,  slots: 40,  speed: 15, name: 'Hanger Boat',        glb: boat2, scale: 2.0, color: 0x88ccff },
  { level: 3, trashNeeded: 10, slots: 70,  speed: 18, name: 'Large Vessel',       glb: boat3, scale: 2.5, color: 0x44aa44 },
  { level: 4, trashNeeded: 15, slots: 120, speed: 20, name: 'House Boat',         glb: boat4, scale: 3.0, color: 0xaa4444 },
];

/**
 * BoatManager.js — Orchestrates boat progression, upgrades, and cinematic effects.
 */
export class BoatManager {
  constructor(engine) {
    this.engine = engine;
    this.currentLevelIndex = 0;
    this.isUpgrading = false;
    
    this.particles = null;

    // Load initial boat
    const initialLevel = (this.engine.options?.initialData?.boatLevel || 1) - 1;
    this.loadLevel(initialLevel);
  }

  loadLevel(index) {
    this.currentLevelIndex = index;
    const config = BOAT_LEVELS[index];
    this.engine.boat._boat.loadUpgrade(config);
    this.engine.boat.maxSpeed = config.speed;
  }

  onTrashCollected(trashCount) {
    if (this.isUpgrading) return;
    
    const nextIndex = this.currentLevelIndex + 1;
    if (nextIndex < BOAT_LEVELS.length) {
      const nextConfig = BOAT_LEVELS[nextIndex];
      if (trashCount >= nextConfig.trashNeeded) {
        this.triggerUpgrade(nextIndex);
      }
    }
  }

  triggerUpgrade(index) {
    this.isUpgrading = true;
    
    // Create poof particles at boat
    this._createPoofParticles();
    
    // Play upgrade sound (optional, assuming no audio engine)
    
    setTimeout(() => {
      this.loadLevel(index);
      
      const config = BOAT_LEVELS[index];
      
      // Update UI via engine callback (hacky but works since HUD isn't directly exposed)
      if (this.engine.callbacks.onBoatUpgrade) {
        this.engine.callbacks.onBoatUpgrade(config);
      }
      
      this.isUpgrading = false;
    }, 500); // Wait 0.5s for particles to cover the boat
  }

  _createPoofParticles() {
    const boatPos = this.engine.boat.getPosition();
    
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vels = [];
    
    for (let i = 0; i < count; i++) {
      pos[i*3] = boatPos.x;
      pos[i*3+1] = boatPos.y + 2.0;
      pos[i*3+2] = boatPos.z;
      
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.random() * 15; // explosive force
      
      vels.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        Math.abs(r * Math.cos(phi)) + 5.0,
        r * Math.sin(phi) * Math.sin(theta)
      ));
    }
    
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    
    const mat = new THREE.PointsMaterial({ 
      color: 0xffffff, 
      size: 1.5, 
      transparent: true, 
      opacity: 1 
    });
    
    const points = new THREE.Points(geo, mat);
    this.engine.scene.add(points);
    
    this.particles = { points, geo, vels, life: 1.0 };
  }

  update(dt) {
    if (this.particles) {
      this.particles.life -= dt * 0.8;
      if (this.particles.life <= 0) {
        this.engine.scene.remove(this.particles.points);
        this.particles.geo.dispose();
        this.particles.points.material.dispose();
        this.particles = null;
      } else {
        this.particles.points.material.opacity = this.particles.life;
        const p = this.particles.geo.attributes.position.array;
        for (let i = 0; i < p.length / 3; i++) {
          p[i*3]   += this.particles.vels[i].x * dt;
          p[i*3+1] += this.particles.vels[i].y * dt;
          p[i*3+2] += this.particles.vels[i].z * dt;
          this.particles.vels[i].y -= 25.0 * dt; // gravity
        }
        this.particles.geo.attributes.position.needsUpdate = true;
      }
    }
  }
}
