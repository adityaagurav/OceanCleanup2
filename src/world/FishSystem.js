import * as THREE from 'three';
import { WorldConfig }  from '../config/WorldConfig.js';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * FishSystem.js — GPU Instanced Fish Schools (Boids)
 * 
 * Features:
 *  - Multiple fish colors/types via InstancedMeshes
 *  - Flocking/schooling behaviors
 *  - Player avoidance
 *  - Reel pickup animation
 */
export class FishSystem {
  constructor(scene, callbacks = {}) {
    this.scene     = scene;
    this.callbacks = callbacks;

    this.activeReels = [];
    this.nearItem = null; // { groupIndex, instanceIndex, pos }
    this.fishCount = 0;
    this.time = 0;

    // Proximity ring indicator (blue for fish)
    const ringGeo = new THREE.RingGeometry(1.5, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3ab7ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85
    });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = Math.PI / 2;
    this._ring.visible = false;
    this.scene.add(this._ring);

    this.fishGroups = [];
    this.fishData = []; // Flat array for fast proximity checks
    
    this._initInstancedMeshesAsync();
  }

  async _initInstancedMeshesAsync() {
    // New types using specific GLB models from the user's wildlife pack
    const types = [
      { glb: 'new_assets/fish/Fish.glb',             isRare: false, baseScale: 0.8 },
      { glb: 'new_assets/fish/Fish-XWl86YFtpF.glb',  isRare: false, baseScale: 0.8 },
      { glb: 'new_assets/fish/Fish-BEcU9rjiAq.glb',  isRare: false, baseScale: 0.8 },
      { glb: 'new_assets/fish/Dolphin.glb',          isRare: true,  baseScale: 0.5 },
      { glb: 'new_assets/fish/Manta ray.glb',        isRare: true,  baseScale: 0.4 },
      { glb: 'new_assets/fish/Shark.glb',            isRare: true,  baseScale: 0.3 },
      { glb: 'new_assets/fish/Whale.glb',            isRare: true,  baseScale: 0.15 }
    ];

    const numSchools = 15;
    const schools = [];
    
    for (let i = 0; i < numSchools; i++) {
      const typeIdx = Math.random() > 0.8 ? (3 + Math.floor(Math.random() * 3)) : Math.floor(Math.random() * 3);
      schools.push({
        typeIndex: typeIdx,
        centerX: (Math.random() - 0.5) * 500,
        centerZ: (Math.random() - 0.5) * 500,
        count: 5 + Math.floor(Math.random() * 15) // 5-20 fish per school
      });
    }

    let globalIndex = 0;

    for (let groupIdx = 0; groupIdx < types.length; groupIdx++) {
      const type = types[groupIdx];
      const schoolsForType = schools.filter(s => s.typeIndex === groupIdx);
      const totalCount = schoolsForType.reduce((acc, s) => acc + s.count, 0);
      
      if (totalCount === 0) continue;

      let gltf;
      try {
        gltf = await AssetManager.loadGLTF(type.glb);
      } catch (err) {
        console.warn(`Fish GLB ${type.glb} failed to load.`, err);
        continue;
      }

      // Extract the first mesh from the loaded GLB
      let currentGeo = null;
      let currentMat = null;
      gltf.scene.traverse((child) => {
        if (child.isMesh && !currentGeo) {
          // Clone geometry and rotate it if needed so it faces forward (Z-axis)
          currentGeo = child.geometry.clone();
          currentMat = child.material;
        }
      });

      if (!currentGeo) {
        console.warn(`No mesh found in ${type.glb}`);
        continue;
      }

      // We apply standard materials for a uniform look
      const instancedMat = new THREE.MeshStandardMaterial({ 
        color: currentMat.color || 0xffffff,
        roughness: 0.3,
        metalness: type.isRare ? 0.8 : 0.1,
        map: currentMat.map || null
      });

      const iMesh = new THREE.InstancedMesh(currentGeo, instancedMat, totalCount);
      iMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      
      const groupData = [];
      let idxInGroup = 0;

      for (const school of schoolsForType) {
        // Base direction for school
        const baseDir = Math.random() * Math.PI * 2;

        for (let i = 0; i < school.count; i++) {
          const offsetX = (Math.random() - 0.5) * 8;
          const offsetZ = (Math.random() - 0.5) * 8;
          const y = -1.5 - Math.random() * 3.0; // Depth 1.5 to 4.5m
          
          const pos = new THREE.Vector3(school.centerX + offsetX, y, school.centerZ + offsetZ);
          const rot = new THREE.Euler(0, baseDir + (Math.random() - 0.5) * 0.5, 0);
          const scale = type.baseScale * (0.8 + Math.random() * 0.4);
          
          const data = {
            id: globalIndex++,
            groupIndex: groupIdx,
            instanceIndex: idxInGroup++,
            pos: pos,
            rot: rot,
            scale: scale,
            speed: 1.5 + Math.random() * 2.0,
            turnSpeed: (Math.random() - 0.5) * 0.5,
            schoolCenterX: school.centerX,
            schoolCenterZ: school.centerZ,
            timeOffset: Math.random() * Math.PI * 2,
            isReeled: false
          };
          
          groupData.push(data);
          this.fishData.push(data);
        }
      }
      
      this.fishGroups.push({
        mesh: iMesh,
        geo: currentGeo,
        mat: instancedMat,
        data: groupData
      });
      
      this.scene.add(iMesh);
    }
  }

  updateProximity(playerPos) {
    let closest = null, minDist = Infinity;
    const R = 15.0; // Larger pickup radius for fish

    for (const f of this.fishData) {
      if (f.isReeled) continue;
      const d = playerPos.distanceTo(f.pos);
      if (d <= R && d < minDist) { minDist = d; closest = f; }
    }

    if (closest) {
      this.nearItem = closest;
      this._ring.position.copy(closest.pos);
      this._ring.position.y = 0.5;
      this._ring.rotation.z += 0.05;
      this._ring.visible = true;
    } else {
      this.nearItem = null;
      this._ring.visible = false;
    }
  }

  update(dt, activePos) {
    this.time += dt;
    const dummy = new THREE.Object3D();

    // 1. Update active reels (fishing mini-animation)
    for (let i = this.activeReels.length - 1; i >= 0; i--) {
      const reel = this.activeReels[i];
      // Deckpos is dynamic in the old system, we will just use activePos + offset for simplicity here
      const targetDeck = activePos.clone().add(new THREE.Vector3(0, 1.2, 0));
      
      reel.progress += 0.04;

      if (reel.progress >= 1.0) {
        this.scene.remove(reel.tempMesh);
        this.scene.remove(reel.line);
        this.activeReels.splice(i, 1);

        this.fishCount++;
        this.callbacks.onFishCollect?.(this.fishCount);
      } else {
        const cur = new THREE.Vector3().lerpVectors(reel.startPos, targetDeck, reel.progress);
        cur.y = Math.sin(reel.progress * Math.PI) * 4 + 0.5; // High arc
        reel.tempMesh.position.copy(cur);
        reel.tempMesh.rotation.x += 0.2;
        reel.line.geometry.setFromPoints([targetDeck, cur]);
      }
    }

    // 2. Update fish behavior
    for (const group of this.fishGroups) {
      let needsUpdate = false;

      for (const f of group.data) {
        if (f.isReeled) continue;
        needsUpdate = true;

        // Player avoidance
        const distToPlayer = activePos.distanceTo(f.pos);
        if (distToPlayer < 20.0) {
          // Turn away from player
          const dirAway = f.pos.clone().sub(activePos).normalize();
          const targetYaw = Math.atan2(dirAway.x, dirAway.z);
          // Simple lerp to target angle
          f.rot.y += (targetYaw - f.rot.y) * 2.0 * dt;
          f.speed = 5.0; // Sprint away
        } else {
          // Wander around school center
          f.speed = 1.5;
          const distToCenter = Math.hypot(f.schoolCenterX - f.pos.x, f.schoolCenterZ - f.pos.z);
          if (distToCenter > 30.0) {
            // Turn back to school center
            const dirBack = new THREE.Vector3(f.schoolCenterX, 0, f.schoolCenterZ).sub(f.pos).normalize();
            const targetYaw = Math.atan2(dirBack.x, dirBack.z);
            f.rot.y += (targetYaw - f.rot.y) * 1.5 * dt;
          } else {
            // Random wander
            if (Math.random() < 0.01) {
              f.turnSpeed = (Math.random() - 0.5) * 1.0;
            }
            f.rot.y += f.turnSpeed * dt;
          }
        }

        // Move forward
        f.pos.x += Math.sin(f.rot.y) * f.speed * dt;
        f.pos.z += Math.cos(f.rot.y) * f.speed * dt;

        // Tail wag (rotate back and forth)
        const wag = Math.sin(this.time * 8.0 + f.timeOffset) * 0.2;

        dummy.position.copy(f.pos);
        dummy.rotation.set(0, f.rot.y + wag, 0);
        dummy.scale.set(f.scale, f.scale, f.scale);
        dummy.updateMatrix();

        group.mesh.setMatrixAt(f.instanceIndex, dummy.matrix);
      }

      if (needsUpdate) {
        group.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  pickupNearest(playerPos, deckPos) {
    if (!this.nearItem || this.nearItem.isReeled) return false;
    if (playerPos.distanceTo(this.nearItem.pos) > 15.0) return false;

    const target = this.nearItem;
    target.isReeled = true;

    // Hide instance by scaling to 0
    const group = this.fishGroups.find(g => g.data.includes(target));
    const dummy = new THREE.Object3D();
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    group.mesh.setMatrixAt(target.instanceIndex, dummy.matrix);
    group.mesh.instanceMatrix.needsUpdate = true;

    // Create a temporary mesh for the reel animation
    const tempMesh = new THREE.Mesh(group.geo, group.mat);
    tempMesh.position.copy(target.pos);
    tempMesh.rotation.copy(target.rot);
    tempMesh.scale.set(target.scale, target.scale, target.scale);
    this.scene.add(tempMesh);

    // Create fishing line
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3ab7ff, linewidth: 2 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([deckPos, target.pos.clone()]);
    const line    = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);

    this.activeReels.push({ 
      tempMesh: tempMesh, 
      line: line, 
      progress: 0, 
      startPos: target.pos.clone() 
    });

    this._ring.visible = false;
    this.nearItem = null;
    return true;
  }
}
