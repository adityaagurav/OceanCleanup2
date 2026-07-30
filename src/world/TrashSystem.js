import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';
import { WorldConfig }  from '../config/WorldConfig.js';

/**
 * TrashSystem.js — GPU Instanced Trash System
 * 
 * Features:
 *  - Clustered spawning (trash islands)
 *  - Drift and bobbing via InstancedMesh matrix updates
 *  - Reel pickup animation (hides instance, spawns temp mesh)
 *  - Extremely high performance for thousands of trash items
 */
export class TrashSystem {
  constructor(scene, callbacks = {}, options = {}) {
    this.scene     = scene;
    this.callbacks = callbacks;
    
    this.activeReels = [];
    this.nearItem    = null; // Holds { groupIndex, instanceIndex, pos }
    this.score       = options.initialData?.score || 0;
    this.trashCount  = options.initialData?.trashCount || 0;
    this.time        = 0;

    // Proximity ring indicator
    const ringGeo = new THREE.RingGeometry(1.2, 1.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.85
    });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = Math.PI / 2;
    this._ring.visible = false;
    this.scene.add(this._ring);

    const density = options.trashDensity ?? 'normal';
    this._count = WorldConfig.TRASH_COUNT[density] ?? WorldConfig.TRASH_COUNT.normal;

    this.trashGroups = [];
    this.trashData = []; // Flat array of all trash data for proximity checks
    
    this._initInstancedMeshes();
  }

  _initInstancedMeshes() {
    // Define different trash types
    const types = [
      // Plastic bottle / Can (Cylinder)
      { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8), mat: new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 }) },
      // Oil Drum (Larger Cylinder)
      { geo: new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), mat: new THREE.MeshStandardMaterial({ color: 0xaa3333, metalness: 0.5 }) },
      // Wood Plank (Box)
      { geo: new THREE.BoxGeometry(0.2, 0.1, 1.5), mat: new THREE.MeshStandardMaterial({ color: 0x8B5A2B }) },
      // Crate (Box)
      { geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshStandardMaterial({ color: 0x6B4A2B }) },
      // Old Tire (Torus)
      { geo: new THREE.TorusGeometry(0.5, 0.2, 8, 16), mat: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }) },
      // Black Garbage Bag (Crumpled shape)
      { geo: new THREE.DodecahedronGeometry(0.6), mat: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6, flatShading: true }) }
    ];

    // How many of each type approximately
    const countPerType = Math.ceil(this._count / types.length);

    // Generate clusters
    const clusters = [];
    const numClusters = Math.max(10, Math.floor(this._count / 20)); // ~20 items per cluster
    for (let i = 0; i < numClusters; i++) {
      const dist = 50 + Math.random() * 400; // Away from center island
      const angle = Math.random() * Math.PI * 2;
      clusters.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        radius: 10 + Math.random() * 30
      });
    }

    let globalIndex = 0;

    types.forEach((type, groupIdx) => {
      const iMesh = new THREE.InstancedMesh(type.geo, type.mat, countPerType);
      iMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      
      const groupData = [];
      
      for (let i = 0; i < countPerType; i++) {
        // Pick a random cluster
        const cluster = clusters[Math.floor(Math.random() * clusters.length)];
        
        // Random position within cluster
        const r = Math.random() * cluster.radius;
        const a = Math.random() * Math.PI * 2;
        const x = cluster.x + Math.cos(a) * r;
        const z = cluster.z + Math.sin(a) * r;
        
        const pos = new THREE.Vector3(x, 0, z);
        const rot = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        const scale = 0.8 + Math.random() * 0.6;
        
        const data = {
          id: globalIndex++,
          groupIndex: groupIdx,
          instanceIndex: i,
          basePos: pos.clone(),
          pos: pos,
          rot: rot,
          scale: scale,
          bobPhase: Math.random() * Math.PI * 2,
          bobSpeed: 1.0 + Math.random(),
          driftSpeedX: (Math.random() - 0.5) * 0.5,
          driftSpeedZ: (Math.random() - 0.5) * 0.5,
          rotSpeed: (Math.random() - 0.5) * 0.5,
          isReeled: false
        };
        
        groupData.push(data);
        this.trashData.push(data);
      }
      
      this.trashGroups.push({
        mesh: iMesh,
        geo: type.geo,
        mat: type.mat,
        data: groupData
      });
      
      this.scene.add(iMesh);
    });
    
    this._updateInstancedMeshes(0);
  }

  // ── Public API ──────────────────────────────────────────────────

  update(dt) {
    this.time += dt;
    this._updateInstancedMeshes(dt);
  }

  updateProximity(playerPos) {
    let closest = null, minDist = Infinity;
    const R = WorldConfig.TRASH_PICKUP_RADIUS;

    for (const t of this.trashData) {
      if (t.isReeled) continue;
      const d = playerPos.distanceTo(t.pos);
      if (d <= R && d < minDist) { minDist = d; closest = t; }
    }

    if (closest) {
      this.nearItem = closest;
      this._ring.position.copy(closest.pos);
      this._ring.position.y = 0.3;
      this._ring.rotation.z += 0.05;
      this._ring.visible = true;
      this.callbacks.onNearTrash?.(true);
    } else {
      this.nearItem = null;
      this._ring.visible = false;
      this.callbacks.onNearTrash?.(false);
    }
  }

  updateReels(deckPos) {
    for (let i = this.activeReels.length - 1; i >= 0; i--) {
      const reel = this.activeReels[i];
      reel.progress += 0.05;

      if (reel.progress >= 1.0) {
        this.scene.remove(reel.tempMesh);
        this.scene.remove(reel.line);
        this.activeReels.splice(i, 1);

        this.trashCount++;
        this.score += 50;
        this.callbacks.onCollect?.(this.score, this.trashCount);
      } else {
        const cur = new THREE.Vector3().lerpVectors(reel.startPos, deckPos, reel.progress);
        cur.y = Math.sin(reel.progress * Math.PI) * 2 + 0.4; // Arc
        reel.tempMesh.position.copy(cur);
        reel.tempMesh.rotation.x += 0.1;
        reel.tempMesh.rotation.y += 0.1;
        reel.line.geometry.setFromPoints([deckPos, cur]);
      }
    }
  }

  pickupNearest(playerPos, deckPos) {
    if (!this.nearItem || this.nearItem.isReeled) return;
    if (playerPos.distanceTo(this.nearItem.pos) > WorldConfig.TRASH_PICKUP_RADIUS) return;

    const target = this.nearItem;
    target.isReeled = true; // Mark as picked up so it stops rendering in instanced mesh

    // Hide instance by scaling to 0
    const group = this.trashGroups[target.groupIndex];
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
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 3 });
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
    this.callbacks.onNearTrash?.(false);
  }

  // ── Private ──────────────────────────────────────────────────────

  _updateInstancedMeshes(dt) {
    const dummy = new THREE.Object3D();

    for (const group of this.trashGroups) {
      let needsUpdate = false;

      for (const t of group.data) {
        if (t.isReeled) continue;
        needsUpdate = true;

        // Drift
        t.basePos.x += t.driftSpeedX * dt;
        t.basePos.z += t.driftSpeedZ * dt;
        
        // Wrap around world (Optional: keep them from drifting forever)
        if (Math.abs(t.basePos.x) > 600) t.basePos.x *= -0.9;
        if (Math.abs(t.basePos.z) > 600) t.basePos.z *= -0.9;

        // Bobbing
        const bob = Math.sin(this.time * t.bobSpeed + t.bobPhase) * 0.2;
        t.pos.set(t.basePos.x, bob, t.basePos.z);

        // Rotation
        t.rot.y += t.rotSpeed * dt;
        t.rot.x = Math.sin(this.time + t.bobPhase) * 0.1;

        dummy.position.copy(t.pos);
        dummy.rotation.copy(t.rot);
        dummy.scale.set(t.scale, t.scale, t.scale);
        dummy.updateMatrix();

        group.mesh.setMatrixAt(t.instanceIndex, dummy.matrix);
      }

      if (needsUpdate) {
        group.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
