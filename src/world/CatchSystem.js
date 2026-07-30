import * as THREE from 'three';

export class CatchSystem {
  constructor(scene, wildlifeSystem, onCatch) {
    this.scene = scene;
    this.wildlife = wildlifeSystem;
    this.onCatch = onCatch;
    this.projectiles = [];
    
    // Simple sphere for the "Capture Ball"
    const geo = new THREE.SphereGeometry(0.5, 16, 16);
    // Make it look like a classic capture ball (red top, white bottom not easily doable with one material, so just red)
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0xff3333, 
      metalness: 0.3, 
      roughness: 0.4,
      emissive: 0x440000 
    });
    this.ballMesh = new THREE.Mesh(geo, mat);
  }
  
  throwBall(origin, forward) {
    const ball = this.ballMesh.clone();
    ball.position.copy(origin);
    
    // Velocity: mostly forward, slightly upwards
    const velocity = forward.clone().normalize().multiplyScalar(35).add(new THREE.Vector3(0, 10, 0));
    
    this.scene.add(ball);
    this.projectiles.push({
      mesh: ball,
      velocity: velocity,
      life: 3.0 // seconds until it despawns if it misses
    });
  }
  
  update(dt) {
    const gravity = new THREE.Vector3(0, -20, 0);
    
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      
      // Remove if life is over or fell way below sea level
      if (p.life <= 0 || p.mesh.position.y < -15) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      
      // Apply gravity
      p.velocity.addScaledVector(gravity, dt);
      p.mesh.position.addScaledVector(p.velocity, dt);
      
      // Check collision with wild creatures
      let hit = false;
      for (let j = this.wildlife.animals.length - 1; j >= 0; j--) {
        const animal = this.wildlife.animals[j];
        
        // Simple distance check for collision
        const dist = p.mesh.position.distanceTo(animal.mesh.position);
        
        // Hit radius depends on the animal's scale (whales are huge, fish are small)
        const hitRadius = animal.config.scale * 4.0; 
        
        if (dist < hitRadius) {
          // SUCCESSFUL CATCH!
          
          // Add a simple visual effect (scale down rapidly or just remove)
          this.scene.remove(animal.mesh);
          this.wildlife.animals.splice(j, 1);
          
          if (this.onCatch) {
            this.onCatch(animal.config);
          }
          
          hit = true;
          break;
        }
      }
      
      // Remove ball if it hit something
      if (hit) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
  
  dispose() {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.projectiles = [];
  }
}
