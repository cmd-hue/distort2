import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class SoftBody {
    constructor(mesh, scene) {
        this.mesh = mesh;
        this.scene = scene;
        this.geometry = mesh.geometry;
        
        // Configuration
        this.params = {
            stiffness: 0.08,     // Force to return to original shape
            damping: 0.85,       // Velocity decay
            mass: 1.0,
            softness: 0.15,      // Neighbor spring strength
            interactionRadius: 0.5,
            interactionStrength: 1.5,
            gravity: -0.015,     // Downward force in ragdoll mode
            floorY: -1.0,        // Relative to mesh position
            pressure: 0.01,       // Reverted balloon pressure
            blowForce: 0.02,      // Adjusted air lift
            maxExpansion: 5.0,    // Increased to allow for more dramatic stretching during high-velocity pushes
            maxVelocity: 100.0    // Significant increase to allow the "yeet" force to take effect
        };

        this.ragdollMode = false;
        this.inflationMode = false;
        this.deflationMode = false;
        this.rippingMode = false;
        this.freezeMode = false;
        this.crushYMode = false;
        this.crushXMode = false;
        this.crushZMode = false;
        this.twoDMode = false;
        this.deleteMode = false;
        this.overlapDetected = false;
        this.time = 0;
        this.initPhysics();
    }

    setRagdoll(enabled) {
        this.ragdollMode = enabled;
    }

    setInflation(enabled) {
        this.inflationMode = enabled;
    }

    setDeflation(enabled) {
        this.deflationMode = enabled;
    }

    setRipping(enabled) {
        this.rippingMode = enabled;
        if (enabled) {
            this.setRagdoll(true);
        }
    }

    setFrozen(enabled) {
        this.freezeMode = enabled;
        if (enabled) {
            // Kill current momentum to "lock" the state, but allow subsequent movement
            for (let i = 0; i < this.velocities.length; i++) {
                this.velocities[i] *= 0.1;
            }
        }
    }

    setCrushY(enabled) {
        this.crushYMode = enabled;
    }

    setCrushX(enabled) {
        this.crushXMode = enabled;
    }

    setCrushZ(enabled) {
        this.crushZMode = enabled;
    }

    setTwoD(enabled) {
        this.twoDMode = enabled;
    }

    setDeleteMode(enabled) {
        this.deleteMode = enabled;
    }

    removeRootParts() {
        const count = this.geometry.attributes.position.count;
        // Find local center relative to current bounding box for better "root" detection
        this.geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        this.geometry.boundingBox.getCenter(center);
        
        const radius = 0.3; 
        const radiusSq = radius * radius;
        let changed = false;

        for (let i = 0; i < count; i++) {
            if (this.deletedVertices[i]) continue;
            
            const idx = i * 3;
            const dx = this.positions[idx] - center.x;
            const dy = this.positions[idx+1] - center.y;
            const dz = this.positions[idx+2] - center.z;
            
            if (dx*dx + dy*dy + dz*dz < radiusSq) {
                this.deletedVertices[i] = 1;
                this.velocities[idx] = 0;
                this.velocities[idx+1] = 0;
                this.velocities[idx+2] = 0;
                changed = true;
            }
        }
        
        if (changed) {
            this.needsIndexUpdate = true;
        }
    }

    deleteAt(point, radius) {
        if (!point || !this.positions) return;

        const localPoint = this.mesh.worldToLocal(point.clone());
        const rangeSq = radius * radius;
        const count = this.geometry.attributes.position.count;
        let changed = false;

        for (let i = 0; i < count; i++) {
            if (this.deletedVertices[i]) continue;

            const idx = i * 3;
            const dx = this.positions[idx] - localPoint.x;
            const dy = this.positions[idx+1] - localPoint.y;
            const dz = this.positions[idx+2] - localPoint.z;
            
            const distSq = dx*dx + dy*dy + dz*dz;
            
            if (distSq < rangeSq) {
                this.deletedVertices[i] = 1;
                changed = true;
                // Zero out velocity so it doesn't affect neighbors anymore
                this.velocities[idx] = 0;
                this.velocities[idx+1] = 0;
                this.velocities[idx+2] = 0;
            }
        }

        if (changed) {
            this.needsIndexUpdate = true;
        }
    }

    resetToOriginal() {
        const count = this.geometry.attributes.position.count;
        for (let i = 0; i < count * 3; i++) {
            this.positions[i] = this.originalPositions[i];
            this.velocities[i] = 0;
        }
        
        // Reset deleted parts
        this.deletedVertices.fill(0);
        if (this.originalIndex) {
            this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.originalIndex), 1));
        }

        // Heal ripped parts
        if (this.backupConstraints) {
            this.constraints = this.backupConstraints.map(c => ({...c}));
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }

    initPhysics() {
        // Ensure geometry has vertex normals and is indexed for efficiency if possible
        // But for softbody physics, we often want unique vertices per face or merged vertices?
        // Merging vertices helps propagate forces through the mesh (connectivity)
        
        // Clone geometry to keep original safe
        const geo = this.geometry.clone();
        
        // If it's a skinned mesh, we need to bake the current pose or just use bind pose
        // Assuming bind pose is fine for this demo.
        
        // Only merge vertices if the model is not already reasonably connected.
        // We use a small tolerance. NOTE: This can break material groups if not careful.
        // For 'Baby Tom' and others, we'll try to keep the original geometry if it's already indexed.
        let targetGeo = geo;
        if (!geo.index) {
            targetGeo = BufferGeometryUtils.mergeVertices(geo, 0.0001);
        }
        
        this.mesh.geometry = targetGeo;
        this.geometry = targetGeo;

        const posAttribute = this.geometry.attributes.position;
        const count = posAttribute.count;

        // Physics State Arrays
        this.originalPositions = new Float32Array(count * 3);
        this.positions = posAttribute.array; // Reference to live geometry
        this.velocities = new Float32Array(count * 3);
        this.forces = new Float32Array(count * 3);
        this.deletedVertices = new Uint8Array(count);
        this.originalIndex = targetGeo.index ? targetGeo.index.array.slice() : null;
        this.needsIndexUpdate = false;

        // Store original positions
        for (let i = 0; i < count * 3; i++) {
            this.originalPositions[i] = this.positions[i];
        }

        // Build Adjacency Graph (Springs)
        // This connects every vertex to its neighbors in the triangle mesh
        this.constraints = [];
        const index = this.geometry.index;
        
        // Helper to add unique constraints
        const connections = new Map();
        const addConstraint = (a, b) => {
            const min = Math.min(a, b);
            const max = Math.max(a, b);
            const key = `${min}_${max}`;
            if (!connections.has(key)) {
                connections.set(key, true);
                
                // Calculate rest length
                const dx = this.originalPositions[a*3] - this.originalPositions[b*3];
                const dy = this.originalPositions[a*3+1] - this.originalPositions[b*3+1];
                const dz = this.originalPositions[a*3+2] - this.originalPositions[b*3+2];
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                this.constraints.push({ a, b, restLength: dist });
            }
        };

        if (index) {
            const array = index.array;
            for (let i = 0; i < array.length; i += 3) {
                const a = array[i];
                const b = array[i+1];
                const c = array[i+2];
                addConstraint(a, b);
                addConstraint(b, c);
                addConstraint(c, a);
            }
        }

        // Store backup for reset
        this.backupConstraints = this.constraints.map(c => ({...c}));
        
        console.log(`SoftBody initialized: ${count} verts, ${this.constraints.length} constraints`);
    }

    applyImpulse(forceVector) {
        const count = this.geometry.attributes.position.count;
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            this.velocities[idx] += forceVector.x;
            this.velocities[idx+1] += forceVector.y;
            this.velocities[idx+2] += forceVector.z;
        }
    }

    explode() {
        const count = this.geometry.attributes.position.count;
        const center = new THREE.Vector3();
        this.geometry.computeBoundingBox();
        this.geometry.boundingBox.getCenter(center);
        
        const force = 0.5;
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            const dx = this.positions[idx] - center.x;
            const dy = this.positions[idx+1] - center.y;
            const dz = this.positions[idx+2] - center.z;
            const mag = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
            
            this.velocities[idx] += (dx / mag) * force;
            this.velocities[idx+1] += (dy / mag) * force;
            this.velocities[idx+2] += (dz / mag) * force;
        }
        this.setRagdoll(true);
    }

    applyInteraction(point, forceDir, isPulling) {
        if (!point) return;

        // Convert world point to local space of the mesh
        const localPoint = this.mesh.worldToLocal(point.clone());
        
        // Auto-scale interaction radius based on model size if not set
        if (!this.autoRadius) {
            this.geometry.computeBoundingSphere();
            this.autoRadius = (this.geometry.boundingSphere.radius || 1) * 0.4;
        }

        const radius = this.autoRadius;
        const rangeSq = radius * radius;
        const count = this.geometry.attributes.position.count;
        
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            const dx = this.positions[idx] - localPoint.x;
            const dy = this.positions[idx+1] - localPoint.y;
            const dz = this.positions[idx+2] - localPoint.z;
            
            const distSq = dx*dx + dy*dy + dz*dz;
            
            if (distSq < rangeSq) {
                const dist = Math.sqrt(distSq);
                const factor = 1 - (dist / radius);
                
                this.velocities[idx] += forceDir.x * this.params.interactionStrength * factor;
                this.velocities[idx+1] += forceDir.y * this.params.interactionStrength * factor;
                this.velocities[idx+2] += forceDir.z * this.params.interactionStrength * factor;
            }
        }
    }

    update(dt) {
        // Limit dt to avoid explosions
        const timeStep = Math.min(dt, 0.05);
        this.time += timeStep;
        const count = this.geometry.attributes.position.count;
        const normals = this.geometry.attributes.normal ? this.geometry.attributes.normal.array : null;

        // Get world position for collision
        const worldPos = new THREE.Vector3();
        this.mesh.getWorldPosition(worldPos);

        // 1. Accumulate Forces
        // 0. Update Index if deletion occurred
        if (this.needsIndexUpdate && this.originalIndex) {
            const newIndices = [];
            for (let i = 0; i < this.originalIndex.length; i += 3) {
                const a = this.originalIndex[i];
                const b = this.originalIndex[i+1];
                const c = this.originalIndex[i+2];
                // Only keep triangle if all vertices are NOT deleted
                if (!this.deletedVertices[a] && !this.deletedVertices[b] && !this.deletedVertices[c]) {
                    newIndices.push(a, b, c);
                }
            }
            this.geometry.setIndex(newIndices);
            this.needsIndexUpdate = false;
        }

        // 1. Accumulate Forces
        for (let i = 0; i < count; i++) {
            if (this.deletedVertices[i]) continue;

            const idx = i * 3;

            let fx = 0;
            let fy = 0;
            let fz = 0;

            const ox = this.originalPositions[idx];
            const oy = this.originalPositions[idx+1];
            const oz = this.originalPositions[idx+2];

            const cx = this.positions[idx];
            const cy = this.positions[idx+1];
            const cz = this.positions[idx+2];

            if (this.rippingMode) {
                // Apply extreme vertical stretching forces
                // Top half gets pulled UP, bottom half gets pulled DOWN
                const stretchForce = 0.05;
                if (oy > 0) {
                    fy += stretchForce * (1 + oy);
                } else {
                    fy -= stretchForce * (1 - oy);
                }
                
                // Add some chaotic horizontal pull too
                fx += (Math.random() - 0.5) * 0.02;
                fz += (Math.random() - 0.5) * 0.02;
            }

            // Distance from original position for limits
            const distFromOrigSq = (cx - ox) ** 2 + (cy - oy) ** 2 + (cz - oz) ** 2;
            const isOverExpanded = distFromOrigSq > (this.params.maxExpansion ** 2);

            if (this.inflationMode && !this.overlapDetected && normals && !isOverExpanded) {
                // Breathing logic: rhythmic expansion and contraction
                // 2.0 frequency gives a nice deep breathing rhythm
                const breathPhase = Math.sin(this.time * 2.0);
                
                // Pressure scale oscillates to create "inhale" and "exhale" effect
                // It goes from almost 0 to a strong expansion
                const pulse = (breathPhase + 1.1) * 0.8;
                const pressureScale = this.params.pressure * pulse;
                
                fx += normals[idx] * pressureScale;
                fy += normals[idx + 1] * pressureScale;
                fz += normals[idx + 2] * pressureScale;

                // Add a subtle vertical "lift" during inhale to simulate a chest rising
                if (breathPhase > 0) {
                    const liftFactor = breathPhase * 0.008;
                    // Apply more lift to vertices that are already pointing upwards
                    if (normals[idx + 1] > 0.1) {
                        fy += liftFactor * normals[idx + 1];
                    }
                }

                // Keep a tiny bit of the air blow for buoyancy
                const upwardBlow = this.params.blowForce * 0.0005 * (1.0 + breathPhase);
                fy += upwardBlow;
            }

            if (this.deflationMode && !this.overlapDetected && normals) {
                // Sucking air out: pull vertices inward along normals
                const suckForce = this.params.pressure * 2.5;
                fx -= normals[idx] * suckForce;
                fy -= normals[idx + 1] * suckForce;
                fz -= normals[idx + 2] * suckForce;

                // Add heavy downward collapse
                fy -= 0.01;
            }

            if (!this.ragdollMode && !this.freezeMode) {
                // Hooke's Law to Original Position (Shape Matching)
                // If inflating, reduce stiffness slightly for more wackiness
                const currentStiffness = this.inflationMode ? this.params.stiffness * 0.4 : this.params.stiffness;
                
                fx += (ox - cx) * currentStiffness;
                fy += (oy - cy) * currentStiffness;
                fz += (oz - cz) * currentStiffness;
            }
            
            if (this.ragdollMode) {
                // Gravity
                fy += this.params.gravity;
            }

            if (this.crushYMode) {
                // Pull everything towards local Y=0
                fy += -cy * 0.2;
                // Add some outward spread for volume conservation (fake)
                const spread = 0.02;
                fx += cx * spread;
                fz += cz * spread;
            }

            if (this.crushXMode) {
                // Pull everything towards local X=0
                fx += -cx * 0.2;
                // Add some outward spread for volume conservation (fake)
                const spread = 0.02;
                fy += cy * spread;
                fz += cz * spread;
            }

            if (this.crushZMode || this.twoDMode) {
                // Pull everything towards local Z=0
                // 2D mode uses a much stronger force for an "atomic" squash to prevent glitching
                const strength = this.twoDMode ? 1.5 : 0.2;
                fz += -cz * strength;
                
                // Add some outward spread for volume conservation only in crush mode
                if (this.crushZMode && !this.twoDMode) {
                    const spread = 0.02;
                    fx += cx * spread;
                    fy += cy * spread;
                }
            }

            // Apply to velocity directly (Verlet-ish)
            this.velocities[idx] += fx;
            this.velocities[idx+1] += fy;
            this.velocities[idx+2] += fz;

            // Damping
            this.velocities[idx] *= this.params.damping;
            this.velocities[idx+1] *= this.params.damping;
            this.velocities[idx+2] *= this.params.damping;

            // SAFETY: Clamp velocity to prevent "demon" mesh explosions
            const vSq = this.velocities[idx]**2 + this.velocities[idx+1]**2 + this.velocities[idx+2]**2;
            if (vSq > this.params.maxVelocity**2) {
                const vRatio = this.params.maxVelocity / Math.sqrt(vSq);
                this.velocities[idx] *= vRatio;
                this.velocities[idx+1] *= vRatio;
                this.velocities[idx+2] *= vRatio;
            }
        }

        // 2. Solve Constraints (Neighbor Springs)
        const ripThreshold = 5.0; // If a spring is stretched 5x its rest length, it SNAPS
        
        for (let i = this.constraints.length - 1; i >= 0; i--) {
            const c = this.constraints[i];
            
            // Skip constraints involving deleted vertices
            if (this.deletedVertices[c.a] || this.deletedVertices[c.b]) {
                // Optionally remove from list to optimize future frames
                this.constraints.splice(i, 1);
                continue;
            }

            const idxA = c.a * 3;
            const idxB = c.b * 3;

            const dx = this.positions[idxB] - this.positions[idxA];
            const dy = this.positions[idxB+1] - this.positions[idxA+1];
            const dz = this.positions[idxB+2] - this.positions[idxA+2];

            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist === 0) continue;

            // Ripping Logic: Remove constraint if stretched too far
            if (this.rippingMode && dist > c.restLength * ripThreshold) {
                this.constraints.splice(i, 1);
                continue;
            }

            const diff = (dist - c.restLength) / dist;
            const force = diff * this.params.softness * 0.5;

            const fx = dx * force;
            const fy = dy * force;
            const fz = dz * force;

            this.velocities[idxA] += fx;
            this.velocities[idxA+1] += fy;
            this.velocities[idxA+2] += fz;

            this.velocities[idxB] -= fx;
            this.velocities[idxB+1] -= fy;
            this.velocities[idxB+2] -= fz;
        }

        // 3. Integrate Position & Ground Collision
        const worldFloorY = worldPos.y + this.params.floorY;
        for (let i = 0; i < count; i++) {
            if (this.deletedVertices[i]) {
                const idx = i * 3;
                this.positions[idx] = 0;
                this.positions[idx+1] = -10; 
                this.positions[idx+2] = 0;
                continue;
            }

            const idx = i * 3;

            if (this.twoDMode) {
                this.velocities[idx + 2] *= 0.01;
                this.positions[idx + 2] *= 0.1;
                if (Math.abs(this.positions[idx + 2]) < 0.001) {
                    this.positions[idx + 2] = 0;
                    this.velocities[idx + 2] = 0;
                }
            }

            this.positions[idx] += this.velocities[idx] * 0.9;
            this.positions[idx+1] += this.velocities[idx+1] * 0.9;
            this.positions[idx+2] += this.velocities[idx+2] * 0.9;

            // Ground Collision (World Space converted to local-ish)
            const vertexWorldY = this.positions[idx+1] + worldPos.y;
            if (vertexWorldY < worldFloorY) {
                this.positions[idx+1] = this.params.floorY;
                this.velocities[idx+1] *= -0.2; 
                this.velocities[idx] *= 0.8;
                this.velocities[idx+2] *= 0.8;
            }
        }

        // 4. Update Three.js Geometry
        this.geometry.attributes.position.needsUpdate = true;
        
        // Recomputing normals is expensive but necessary for lighting changes
        // Optimization: Do it every other frame or every 3rd frame if laggy
        this.geometry.computeVertexNormals();
    }
}