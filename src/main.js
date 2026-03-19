import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import nipplejs from 'nipplejs';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { SoftBody } from './SoftBody.js';

// Braille Translation Logic
const brailleMap = {
    'a': '⠁', 'b': '⠃', 'c': '⠉', 'd': '⠙', 'e': '⠑', 'f': '⠋', 'g': '⠛', 'h': '⠓', 'i': '⠊', 'j': '⠚',
    'k': '⠅', 'l': '⠇', 'm': '⠍', 'n': '⠝', 'o': '⠕', 'p': '⠏', 'q': '⠟', 'r': '⠗', 's': '⠎', 't': '⠞',
    'u': '⠥', 'v': '⠧', 'w': '⠺', 'x': '⠭', 'y': '⠽', 'z': '⠵',
    '1': '⠼⠁', '2': '⠼⠃', '3': '⠼⠉', '4': '⠼⠙', '5': '⠼⠑', '6': '⠼⠋', '7': '⠼⠛', '8': '⠼⠓', '9': '⠼⠊', '0': '⠼⠚',
    ' ': ' ', '.': '⠲', ',': '⠂', '!': '⠖', '?': '⠦', ':': '⠒', '-': '⠤', '(': '⠐⠣', ')': '⠐⠜', '/': '⠸⠌', '+': '⠬', '&': '⠿'
};

let brailleEnabled = false;

function translateToBraille(text) {
    if (!brailleEnabled) return text;
    return text.toLowerCase().split('').map(char => brailleMap[char] || char).join('');
}

function updateElementText(el, text) {
    if (!el) return;
    el.setAttribute('data-current-text', text);
    el.innerText = translateToBraille(text);
}

function refreshAllUIText() {
    // Select all potential text elements
    const elements = document.querySelectorAll('button, #instructions, #loading, #warning-content h2, #warning-content p');
    elements.forEach(el => {
        const text = el.getAttribute('data-current-text') || el.innerText;
        el.setAttribute('data-current-text', text);
        el.innerText = translateToBraille(text);
    });
}

// Setup basic scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// Load default skybox
new THREE.TextureLoader().load('/skyob.png', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    scene.environment = texture;
});

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 2.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// CSS3D Renderer for Webview
const labelRenderer = new CSS3DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('css-container').appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Movement state
const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    joystick: { x: 0, y: 0 }
};

const moveSpeed = 5.0;

// WASD Controls
window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'KeyE': freezeBtn.click(); break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
    }
});

// Mobile Joystick
const joystickZone = document.getElementById('joystick-zone');
const joystick = nipplejs.create({
    zone: joystickZone,
    mode: 'static',
    position: { left: '60px', top: '60px' },
    color: 'white',
    size: 100
});

joystick.on('move', (evt, data) => {
    moveState.joystick.x = data.vector.x;
    moveState.joystick.y = data.vector.y;
});

joystick.on('end', () => {
    moveState.joystick.x = 0;
    moveState.joystick.y = 0;
});

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 8, 5);
dirLight.castShadow = false;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 20;
dirLight.shadow.camera.left = -5;
dirLight.shadow.camera.right = 5;
dirLight.shadow.camera.top = 5;
dirLight.shadow.camera.bottom = -5;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Sun Mesh (Visual for the Light)
const sunGeo = new THREE.SphereGeometry(0.8, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff3aa });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.copy(dirLight.position);
sunMesh.visible = false;
scene.add(sunMesh);

const backLight = new THREE.DirectionalLight(0xff8888, 0.5);
backLight.position.set(-5, 2, -5);
scene.add(backLight);

// Floor helper
const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
grid.position.y = 0;
scene.add(grid);

// Shadow plane
const shadowPlaneGeo = new THREE.PlaneGeometry(20, 20);
const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.4 });
const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = 0.001; // Just above grid
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// Audio
const squishAudio = new Audio('./squish.mp3');
const playSquish = () => {
    if (squishAudio.paused) {
        squishAudio.currentTime = 0;
        squishAudio.play().catch(() => {});
    } else if (squishAudio.currentTime > 0.1) {
        const clone = squishAudio.cloneNode();
        clone.play().catch(() => {});
    }
};

// Softbody Logic
let softBodies = []; // Now managing multiple bodies
let webviewSoftBody = null;
let currentMesh = null; // Reference to the "primary" or latest mesh
let currentModelUrl = '/tom.glb';
let currentModelFormat = 'gltf'; // Track for texture flipY logic
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const planeIntersect = new THREE.Vector3();

// Loading
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const loadingEl = document.getElementById('loading');

const ragdollBtn = document.getElementById('ragdoll-btn');
const faintBtn = document.getElementById('faint-btn');
const pushBtn = document.getElementById('push-btn');
const jumpFreezeBtn = document.getElementById('jump-freeze-btn');
const inflateBtn = document.getElementById('inflate-btn');
const deflateBtn = document.getElementById('deflate-btn');
const removeRootBtn = document.getElementById('remove-root-btn');
const ripBtn = document.getElementById('rip-btn');
const crushYBtn = document.getElementById('crush-y-btn');
const crushXBtn = document.getElementById('crush-x-btn');
const crushZBtn = document.getElementById('crush-z-btn');
const twoDBtn = document.getElementById('two-d-btn');
const postBtn = document.getElementById('post-btn');
const deleteBtn = document.getElementById('delete-btn');
const freezeBtn = document.getElementById('freeze-btn');
const renderBtn = document.getElementById('render-btn');
const brailleBtn = document.getElementById('braille-btn');
const webviewBtn = document.getElementById('webview-btn');
const resetBtn = document.getElementById('reset-btn');
let ragdollEnabled = false;
let faintEnabled = false;
let inflationEnabled = false;
let deflationEnabled = false;
let rippingEnabled = false;
let freezeEnabled = false;
let crushYEnabled = false;
let crushXEnabled = false;
let crushZEnabled = false;
let twoDEnabled = false;
let deleteEnabled = false;

ragdollBtn.addEventListener('click', () => {
    ragdollEnabled = !ragdollEnabled;
    ragdollBtn.classList.toggle('active', ragdollEnabled);
    updateElementText(ragdollBtn, ragdollEnabled ? 'Ragdoll: ON' : 'Ragdoll: OFF');
    
    // If we turn off ragdoll, also turn off faint
    if (!ragdollEnabled && faintEnabled) {
        faintEnabled = false;
        faintBtn.classList.remove('active');
        updateElementText(faintBtn, 'Faint: OFF');
    }

    softBodies.forEach(sb => sb.setRagdoll(ragdollEnabled));
});

faintBtn.addEventListener('click', () => {
    faintEnabled = !faintEnabled;
    faintBtn.classList.toggle('active', faintEnabled);
    updateElementText(faintBtn, faintEnabled ? 'Faint: ON' : 'Faint: OFF');
    
    ragdollEnabled = faintEnabled;
    ragdollBtn.classList.toggle('active', ragdollEnabled);
    updateElementText(ragdollBtn, ragdollEnabled ? 'Ragdoll: ON' : 'Ragdoll: OFF');

    softBodies.forEach(sb => {
        sb.setRagdoll(ragdollEnabled);
        if (faintEnabled) {
            sb.applyImpulse(new THREE.Vector3(0, 0, -0.05));
        }
    });
    playSquish();
});

function checkCrashCondition() {
    if (inflationEnabled && deflationEnabled) {
        const crashOverlay = document.getElementById('crash-overlay');
        if (crashOverlay) {
            crashOverlay.style.display = 'flex';
            setTimeout(() => {
                crashOverlay.style.display = 'none';
            }, 3000);
        }
    }
}

inflateBtn.addEventListener('click', () => {
    inflationEnabled = !inflationEnabled;
    inflateBtn.classList.toggle('active', inflationEnabled);
    updateElementText(inflateBtn, inflationEnabled ? 'Inflate: ON' : 'Inflate: OFF');
    
    softBodies.forEach(sb => sb.setInflation(inflationEnabled));
    if (webviewSoftBody) webviewSoftBody.setInflation(inflationEnabled);
    
    checkCrashCondition();
    playSquish();
});

deflateBtn.addEventListener('click', () => {
    deflationEnabled = !deflationEnabled;
    deflateBtn.classList.toggle('active', deflationEnabled);
    updateElementText(deflateBtn, deflationEnabled ? 'Deflate: ON' : 'Deflate: OFF');
    
    softBodies.forEach(sb => sb.setDeflation(deflationEnabled));
    if (webviewSoftBody) webviewSoftBody.setDeflation(deflationEnabled);
    
    checkCrashCondition();
    playSquish();
});

removeRootBtn.addEventListener('click', () => {
    softBodies.forEach(sb => sb.removeRootParts());
    if (webviewSoftBody) webviewSoftBody.removeRootParts();
    playSquish();
});

ripBtn.addEventListener('click', () => {
    rippingEnabled = !rippingEnabled;
    ripBtn.classList.toggle('active', rippingEnabled);
    updateElementText(ripBtn, rippingEnabled ? 'STOP RIPPING' : 'Rip Apart!');
    
    if (rippingEnabled) {
        ragdollEnabled = true;
        ragdollBtn.classList.add('active');
        updateElementText(ragdollBtn, 'Ragdoll: ON');
    }

    softBodies.forEach(sb => {
        sb.setRipping(rippingEnabled);
        sb.setRagdoll(ragdollEnabled);
    });
    if (webviewSoftBody) {
        webviewSoftBody.setRipping(rippingEnabled);
    }
    playSquish();
});

freezeBtn.addEventListener('click', () => {
    freezeEnabled = !freezeEnabled;
    freezeBtn.classList.toggle('active', freezeEnabled);
    updateElementText(freezeBtn, freezeEnabled ? 'Freeze: ON' : 'Freeze: OFF');
    softBodies.forEach(sb => sb.setFrozen(freezeEnabled));
    if (webviewSoftBody) webviewSoftBody.setFrozen(freezeEnabled);
    playSquish();
});

jumpFreezeBtn.addEventListener('click', () => {
    if (softBodies.length === 0) return;
    
    softBodies.forEach(sb => sb.applyImpulse(new THREE.Vector3(0, 0.8, 0)));
    if (webviewSoftBody) webviewSoftBody.applyImpulse(new THREE.Vector3(0, 0.8, 0));
    
    setTimeout(() => {
        freezeEnabled = true;
        freezeBtn.classList.add('active');
        updateElementText(freezeBtn, 'Freeze: ON');
        softBodies.forEach(sb => sb.setFrozen(true));
        if (webviewSoftBody) webviewSoftBody.setFrozen(true);
        playSquish();
    }, 150);
});

crushYBtn.addEventListener('click', () => {
    crushYEnabled = !crushYEnabled;
    crushYBtn.classList.toggle('active', crushYEnabled);
    updateElementText(crushYBtn, crushYEnabled ? 'Crush Y: ON' : 'Crush Y: OFF');
    softBodies.forEach(sb => sb.setCrushY(crushYEnabled));
    if (webviewSoftBody) webviewSoftBody.setCrushY(crushYEnabled);
    playSquish();
});

crushXBtn.addEventListener('click', () => {
    crushXEnabled = !crushXEnabled;
    crushXBtn.classList.toggle('active', crushXEnabled);
    updateElementText(crushXBtn, crushXEnabled ? 'Crush X: ON' : 'Crush X: OFF');
    softBodies.forEach(sb => sb.setCrushX(crushXEnabled));
    if (webviewSoftBody) webviewSoftBody.setCrushX(crushXEnabled);
    playSquish();
});

crushZBtn.addEventListener('click', () => {
    crushZEnabled = !crushZEnabled;
    crushZBtn.classList.toggle('active', crushZEnabled);
    updateElementText(crushZBtn, crushZEnabled ? 'Crush Z: ON' : 'Crush Z: OFF');
    softBodies.forEach(sb => sb.setCrushZ(crushZEnabled));
    if (webviewSoftBody) webviewSoftBody.setCrushZ(crushZEnabled);
    playSquish();
});

twoDBtn.addEventListener('click', () => {
    twoDEnabled = !twoDEnabled;
    twoDBtn.classList.toggle('active', twoDEnabled);
    updateElementText(twoDBtn, twoDEnabled ? 'Atomic 2D: ON' : 'Atomic 2D: OFF');
    
    if (twoDEnabled) {
        const targetPos = new THREE.Vector3(0, 1.5, 3.5);
        const duration = 1000;
        const startPos = camera.position.clone();
        const startTime = performance.now();
        
        const animateCam = (time) => {
            const progress = Math.min((time - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            camera.position.lerpVectors(startPos, targetPos, ease);
            controls.target.set(0, 1, 0);
            if (progress < 1) requestAnimationFrame(animateCam);
        };
        requestAnimationFrame(animateCam);
    }

    softBodies.forEach(sb => sb.setTwoD(twoDEnabled));
    if (webviewSoftBody) webviewSoftBody.setTwoD(twoDEnabled);
    playSquish();
});

deleteBtn.addEventListener('click', () => {
    deleteEnabled = !deleteEnabled;
    deleteBtn.classList.toggle('active', deleteEnabled);
    updateElementText(deleteBtn, deleteEnabled ? 'DELETE: ON' : 'Delete: OFF');
    
    softBodies.forEach(sb => sb.setDeleteMode(deleteEnabled));
    if (webviewSoftBody) webviewSoftBody.setDeleteMode(deleteEnabled);
    playSquish();
});

let renderEnabled = false;
renderBtn.addEventListener('click', () => {
    if (!renderEnabled) {
        const confirmLag = confirm("WARNING: Enabling High-Quality Render (Shadows) will significantly increase GPU load and may cause your device to lag. Proceed?");
        if (!confirmLag) return;
    }

    renderEnabled = !renderEnabled;
    renderBtn.classList.toggle('active', renderEnabled);
    updateElementText(renderBtn, renderEnabled ? 'Render: ON' : 'Render: OFF');
    
    // Toggle Three.js Shadows
    renderer.shadowMap.enabled = renderEnabled;
    dirLight.castShadow = renderEnabled;
    sunMesh.visible = renderEnabled;
    
    // Refresh materials to ensure shadow support
    scene.traverse((node) => {
        if (node.isMesh && node.material) {
            if (Array.isArray(node.material)) {
                node.material.forEach(m => m.needsUpdate = true);
            } else {
                node.material.needsUpdate = true;
            }
        }
    });
    
    playSquish();
});

brailleBtn.addEventListener('click', () => {
    brailleEnabled = !brailleEnabled;
    brailleBtn.classList.toggle('active', brailleEnabled);
    
    // We update current state text first so refresh handles it correctly
    brailleBtn.setAttribute('data-current-text', brailleEnabled ? 'Braille: ON' : 'Braille: OFF');
    
    refreshAllUIText();
    playSquish();
});

let webviewPart = null;
let webviewEnabled = false;

webviewBtn.addEventListener('click', () => {
    if (!webviewEnabled) {
        const sitePrompt = translateToBraille("Enter the website URL to display:");
        let site = prompt(sitePrompt, "https://websim.ai");
        if (site === null) return;

        const aspectPrompt = translateToBraille("Enter aspect ratio (e.g. 16:9, 4:3, 1:1, 9:16):");
        let aspect = prompt(aspectPrompt, "16:9");
        if (aspect === null) return;
        
        if (site.trim() === "") site = "https://websim.ai";
        if (!site.startsWith('http://') && !site.startsWith('https://')) {
            site = 'https://' + site;
        }

        webviewEnabled = true;
        webviewBtn.classList.add('active');
        updateElementText(webviewBtn, 'Webview: ON');
        spawnWebviewPart(site, aspect);
    } else {
        webviewEnabled = false;
        webviewBtn.classList.remove('active');
        updateElementText(webviewBtn, 'Webview: OFF');
        deleteWebviewPart();
    }
    playSquish();
});

function spawnWebviewPart(url, aspectRatioStr = "16:9") {
    if (webviewPart) return;

    let w = 1.6;
    let h = 0.9;
    const parts = aspectRatioStr.split(':');
    if (parts.length === 2) {
        const rw = parseFloat(parts[0]);
        const rh = parseFloat(parts[1]);
        if (!isNaN(rw) && !isNaN(rh) && rh !== 0) {
            const ratio = rw / rh;
            if (ratio < 0.5) {
                h = 1.6;
                w = 1.6 * ratio;
            } else {
                w = 1.6;
                h = 1.6 / ratio;
            }
        }
    }

    // 1. The Frame (Visual Mesh) - High segment count for wobbliness
    const frameGeo = new THREE.BoxGeometry(w, h, 0.1, 12, 12, 2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.2 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;

    // 2. The Web Content (CSS3D)
    const iframe = document.createElement('iframe');
    iframe.src = url || 'https://websim.ai';
    
    // Internal high-res for clarity
    const res = 1000;
    const iW = res;
    const iH = Math.round(res * (h/w));
    iframe.style.width = iW + 'px';
    iframe.style.height = iH + 'px';
    
    const cssObject = new CSS3DObject(iframe);
    // Scale to fit frame, slightly smaller to prevent edge artifacts
    cssObject.scale.set((w * 0.96) / iW, (h * 0.96) / iH, 1);

    // Initial position in front of camera
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    frameMesh.position.copy(camera.position).add(cameraDir.multiplyScalar(2.5));
    frameMesh.lookAt(camera.position);

    scene.add(frameMesh);
    scene.add(cssObject);
    
    webviewPart = frameMesh;
    webviewPart.userData.cssObject = cssObject;

    // Initialize SoftBody for the webview frame
    webviewSoftBody = new SoftBody(frameMesh, scene);
    webviewSoftBody.params.stiffness = 0.15;
    webviewSoftBody.params.softness = 0.1;
    
    // Sync current toggle states
    webviewSoftBody.setRagdoll(ragdollEnabled);
    webviewSoftBody.setInflation(inflationEnabled);
    webviewSoftBody.setDeflation(deflationEnabled);
    webviewSoftBody.setFrozen(freezeEnabled);
    webviewSoftBody.setCrushY(crushYEnabled);
    webviewSoftBody.setCrushX(crushXEnabled);
    webviewSoftBody.setCrushZ(crushZEnabled);
    webviewSoftBody.setTwoD(twoDEnabled);
    webviewSoftBody.setDeleteMode(deleteEnabled);
}

function deleteWebviewPart() {
    if (webviewPart) {
        if (webviewPart.userData.cssObject) {
            scene.remove(webviewPart.userData.cssObject);
        }
        scene.remove(webviewPart);
        webviewPart.traverse(node => {
            if (node.isMesh) {
                node.geometry.dispose();
                node.material.dispose();
            }
        });
        webviewPart = null;
        webviewSoftBody = null;
    }
}

const cloneBtn = document.getElementById('clone-btn');
cloneBtn.addEventListener('click', () => {
    if (currentMesh) {
        // Simple clone: offset it slightly
        spawnModelFromMesh(currentMesh, new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5));
        playSquish();
    }
});

const explodeBtn = document.getElementById('explode-btn');
explodeBtn.addEventListener('click', () => {
    softBodies.forEach(sb => sb.explode());
    playSquish();
});

let rainInterval = null;
let rainEnabled = false;
const rainBtn = document.getElementById('rain-btn');
rainBtn.addEventListener('click', () => {
    rainEnabled = !rainEnabled;
    rainBtn.classList.toggle('active', rainEnabled);
    updateElementText(rainBtn, rainEnabled ? 'Rain: ON' : 'Rain: OFF');
    
    if (rainEnabled) {
        rainInterval = setInterval(() => {
            if (softBodies.length < 15) { // Safety limit
                spawnModelFromMesh(currentMesh, new THREE.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * 4));
            }
        }, 1000);
    } else {
        clearInterval(rainInterval);
    }
    playSquish();
});

resetBtn.addEventListener('click', () => {
    softBodies.forEach(sb => sb.resetToOriginal());
    if (webviewSoftBody) webviewSoftBody.resetToOriginal();
    playSquish();
});

pushBtn.addEventListener('click', () => {
    const bodies = [...softBodies, webviewSoftBody].filter(b => b);
    if (bodies.length === 0) return;
    
    if (!ragdollEnabled) {
        ragdollEnabled = true;
        ragdollBtn.classList.add('active');
        updateElementText(ragdollBtn, 'Ragdoll: ON');
        bodies.forEach(b => b.setRagdoll(true));
    }

    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    cameraDir.y = 0;
    cameraDir.normalize();
    
    const pushMagnitude = 2;
    const finalImpulse = new THREE.Vector3(
        cameraDir.x * pushMagnitude,
        pushMagnitude * 0.6,
        cameraDir.z * pushMagnitude
    );

    bodies.forEach(b => b.applyImpulse(finalImpulse));
    playSquish();
});

function spawnModelFromMesh(meshToClone, position) {
    if (!meshToClone) return;
    
    // Clone geometry and materials correctly
    const newGeo = meshToClone.geometry.clone();
    // Material is shared for efficiency, but we can clone it if needed
    const newMesh = new THREE.Mesh(newGeo, meshToClone.material);
    newMesh.position.copy(position || new THREE.Vector3(0, 1, 0));
    newMesh.castShadow = true;
    newMesh.receiveShadow = true;
    
    scene.add(newMesh);
    const newSB = new SoftBody(newMesh, scene);
    
    // Sync current global states to the new body
    newSB.setRagdoll(ragdollEnabled);
    newSB.setInflation(inflationEnabled);
    newSB.setDeflation(deflationEnabled);
    newSB.setRipping(rippingEnabled);
    newSB.setFrozen(freezeEnabled);
    newSB.setCrushY(crushYEnabled);
    newSB.setCrushX(crushXEnabled);
    newSB.setCrushZ(crushZEnabled);
    newSB.setTwoD(twoDEnabled);
    newSB.setDeleteMode(deleteEnabled);
    
    softBodies.push(newSB);
    return newSB;
}

function loadModel(url, isOBJ = false) {
    currentModelFormat = isOBJ ? 'obj' : 'gltf';
    document.body.classList.add('loading-cursor');
    loadingEl.style.opacity = '1';
    updateElementText(loadingEl, "Loading Model...");
    
    // Cleanup previous softbodies and their meshes
    softBodies.forEach(sb => {
        scene.remove(sb.mesh);
        if (sb.geometry) sb.geometry.dispose();
    });
    softBodies = [];
    currentMesh = null;

    const onModelLoaded = (modelContainer) => {
        loadingEl.style.opacity = '0';
        
        // GLTF returns {scene: Group}, OBJ returns Group
        const model = modelContainer.scene || modelContainer;
        model.updateMatrixWorld(true);
        
        const meshes = [];
        model.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
                if (child.skeleton) child.skeleton.pose(); // Reset skinned meshes to bind pose
                meshes.push(child);
            }
        });

        if (meshes.length > 0) {
            const geometries = [];
            const materials = [];
            
            // Identify which attributes are present across any of the meshes
            const hasUV = meshes.some(m => m.geometry.attributes.uv);
            const hasNormal = meshes.some(m => m.geometry.attributes.normal);
            const hasColor = meshes.some(m => m.geometry.attributes.color);

            meshes.forEach((mesh) => {
                // Ensure 1:1 mapping for BufferGeometryUtils.mergeGeometries(..., true)
                // If a mesh has multiple materials, we try to use the first one or split
                // In this context, using the first material ensures stability for softbody physics
                let geom = mesh.geometry.clone();
                geom.applyMatrix4(mesh.matrixWorld);

                if (hasUV && !geom.attributes.uv) {
                    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geom.attributes.position.count * 2), 2));
                }
                if (hasNormal && !geom.attributes.normal) {
                    geom.computeVertexNormals();
                }
                if (hasColor && !geom.attributes.color) {
                    const colors = new Float32Array(geom.attributes.position.count * 3).fill(1);
                    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                }

                const validAttributes = ['position', 'normal', 'uv', 'color'];
                Object.keys(geom.attributes).forEach(key => {
                    if (!validAttributes.includes(key)) geom.deleteAttribute(key);
                });

                geometries.push(geom);
                
                const originalMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                const mat = originalMat.clone();
                if (hasColor) mat.vertexColors = true;
                mat.transparent = true;
                mat.alphaTest = 0.5;
                mat.side = THREE.DoubleSide;
                
                materials.push(mat);
            });

            // Merge with groups enabled to maintain material mapping
            const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries, true);
            const mainMesh = new THREE.Mesh(mergedGeo, materials);
            
            mainMesh.geometry.computeBoundingBox();
            const center = mainMesh.geometry.boundingBox.getCenter(new THREE.Vector3());
            mainMesh.geometry.translate(-center.x, -center.y, -center.z);
            
            const size = mainMesh.geometry.boundingBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 1.8 / maxDim;
            mainMesh.geometry.scale(scale, scale, scale);
            mainMesh.position.set(0, 1, 0);
            
            scene.add(mainMesh);
            currentMesh = mainMesh;
            
            const mainSB = new SoftBody(mainMesh, scene);
            mainSB.setRagdoll(ragdollEnabled);
            mainSB.setInflation(inflationEnabled);
            mainSB.setDeflation(deflationEnabled);
            mainSB.setRipping(rippingEnabled);
            mainSB.setFrozen(freezeEnabled);
            mainSB.setCrushY(crushYEnabled);
            mainSB.setCrushX(crushXEnabled);
            mainSB.setCrushZ(crushZEnabled);
            mainSB.setTwoD(twoDEnabled);
            mainSB.setDeleteMode(deleteEnabled);
            softBodies.push(mainSB);
        }
        document.body.classList.remove('loading-cursor');
    };

    const onError = (err) => {
        console.error(err);
        updateElementText(loadingEl, "Error loading model.");
        document.body.classList.remove('loading-cursor');
    };

    if (isOBJ) {
        objLoader.load(url, onModelLoaded, undefined, onError);
    } else {
        gltfLoader.load(url, onModelLoaded, undefined, onError);
    }
}

// Device Warning Logic
const warningOverlay = document.getElementById('warning-overlay');
const warningClose = document.getElementById('warning-close');

warningClose.addEventListener('click', () => {
    warningOverlay.style.opacity = '0';
    setTimeout(() => {
        warningOverlay.style.display = 'none';
    }, 500);
});

// Model Selector Buttons
const selectorBtns = document.querySelectorAll('.selector-btn');
const importBtn = document.getElementById('import-btn');
const fileInput = document.getElementById('file-input');
const textureBtn = document.getElementById('texture-btn');
const textureRemoveBtn = document.getElementById('texture-remove-btn');
const textureInput = document.getElementById('texture-input');
const reflectionBtn = document.getElementById('reflection-btn');
const reflectionInput = document.getElementById('reflection-input');
selectorBtns.forEach(btn => {
    if (['import-btn', 'texture-btn', 'texture-remove-btn', 'reflection-btn'].includes(btn.id)) return;
    btn.addEventListener('click', () => {
        const modelUrl = btn.dataset.model;
        
        // Special warning for high-poly models like Xbox One
        if (modelUrl === '/xbox_one.glb') {
            const proceed = confirm("CRASH WARNING: The Xbox One model is extremely high detail. Loading it may cause your browser to freeze or crash your device. Do you want to try anyway?");
            if (!proceed) return;
        }

        selectorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentModelUrl = modelUrl;
        loadModel(currentModelUrl);
    });
});

importBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectorBtns.forEach(b => b.classList.remove('active'));
        importBtn.classList.add('active');
        
        const isOBJ = file.name.toLowerCase().endsWith('.obj');
        currentModelUrl = URL.createObjectURL(file);
        loadModel(currentModelUrl, isOBJ);
        
        // Note: In a production app, we should revoke this URL after loading
        // but for this interactive sandbox, we'll keep it simple.
    }
});

reflectionBtn.addEventListener('click', () => {
    reflectionInput.click();
});

reflectionInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        document.body.classList.add('loading-cursor');
        const url = URL.createObjectURL(file);
        const textureLoader = new THREE.TextureLoader();
        
        loadingEl.style.opacity = '1';
        updateElementText(loadingEl, "Processing Sky...");
        
        textureLoader.load(url, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            
            scene.environment = texture;
            scene.background = texture;
            scene.backgroundBlurriness = 0.1;
            
            loadingEl.style.opacity = '0';
            document.body.classList.remove('loading-cursor');
            playSquish();
            
            // Re-apply to all existing materials
            scene.traverse((node) => {
                if (node.isMesh && node.material) {
                    node.material.needsUpdate = true;
                }
            });
        }, undefined, (err) => {
            console.error(err);
            updateElementText(loadingEl, "Error loading image.");
            document.body.classList.remove('loading-cursor');
        });
    }
});

textureBtn.addEventListener('click', () => {
    textureInput.click();
});

textureInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && currentMesh) {
        document.body.classList.add('loading-cursor');
        const url = URL.createObjectURL(file);
        const textureLoader = new THREE.TextureLoader();
        
        loadingEl.style.opacity = '1';
        updateElementText(loadingEl, "Applying Texture...");
        
        textureLoader.load(url, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            
            // GLTF uses flipY=false, OBJ (and standard images) usually use flipY=true
            texture.flipY = (currentModelFormat === 'obj');
            
            const applyToMaterial = (mat) => {
                mat.map = texture;
                mat.needsUpdate = true;
            };

            if (Array.isArray(currentMesh.material)) {
                currentMesh.material.forEach(applyToMaterial);
            } else {
                applyToMaterial(currentMesh.material);
            }
            
            loadingEl.style.opacity = '0';
            document.body.classList.remove('loading-cursor');
            playSquish();
        }, undefined, (err) => {
            console.error(err);
            updateElementText(loadingEl, "Error loading texture.");
            document.body.classList.remove('loading-cursor');
        });
    }
});

textureRemoveBtn.addEventListener('click', () => {
    if (currentMesh) {
        const removeMap = (mat) => {
            mat.map = null;
            mat.needsUpdate = true;
        };

        if (Array.isArray(currentMesh.material)) {
            currentMesh.material.forEach(removeMap);
        } else {
            removeMap(currentMesh.material);
        }
        playSquish();
    }
});

// Post Snapshot Logic - Captures the current deformed state and "posts" it (uploads)
postBtn.addEventListener('click', async () => {
    if (!currentMesh) return;
    
    // 1. Show loading state
    document.body.classList.add('loading-cursor');
    const originalText = postBtn.getAttribute('data-current-text') || postBtn.innerText;
    updateElementText(postBtn, "POSTING...");
    postBtn.disabled = true;
    
    try {
        // 2. Capture the current frame
        // Ensure we render the current state immediately before capture
        renderer.render(scene, camera);
        
        const blob = await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png'));
        const file = new File([blob], `squish_snapshot_${Date.now()}.png`, { type: 'image/png' });
        
        // 3. Upload to WebSim S3
        const url = await websim.upload(file);
        
        // 4. Feedback to user
        console.log("Snapshot uploaded successfully:", url);
        
        // Since we can't literally post to the platform comments via JS, 
        // we provide the link and a success message.
        const successMsg = document.createElement('div');
        successMsg.style.cssText = `
            position: fixed; top: 20px; right: 20px; 
            background: #1abc9c; color: white; padding: 15px 25px; 
            border-radius: 10px; z-index: 10000; font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        successMsg.innerHTML = `Snapshot Posted! <br><small style="font-weight:normal;font-size:10px;">Link copied to console</small>`;
        document.body.appendChild(successMsg);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            successMsg.style.opacity = '0';
            successMsg.style.transition = 'opacity 0.5s';
            setTimeout(() => successMsg.remove(), 500);
        }, 3000);

        playSquish();
    } catch (error) {
        console.error("Failed to post snapshot:", error);
        alert("Failed to post: " + error.message);
    } finally {
        // 5. Restore UI
        document.body.classList.remove('loading-cursor');
        updateElementText(postBtn, originalText);
        postBtn.disabled = false;
    }
});

// Initialize Braille cache and states
refreshAllUIText();

// Initial load
selectorBtns[0].classList.add('active');
loadModel('/tom.glb');

// Interaction
let isDragging = false;
let previousMousePosition = new THREE.Vector3();

let activeDragBody = null;

function onPointerDown(event) {
    updateMouse(event);
    raycaster.setFromCamera(mouse, camera);

    const bodies = [...softBodies, webviewSoftBody].filter(b => b);
    for (const body of bodies) {
        const intersects = raycaster.intersectObject(body.mesh);
        if (intersects.length > 0) {
            isDragging = true;
            activeDragBody = body;
            controls.enabled = false;
            
            const intersectPoint = intersects[0].point;
            plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), intersectPoint);
            raycaster.ray.intersectPlane(plane, previousMousePosition);
            
            playSquish();
            break;
        }
    }
}

function onPointerMove(event) {
    updateMouse(event);
    
    if (isDragging && activeDragBody) {
        raycaster.setFromCamera(mouse, camera);
        
        const currentIntersect = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, currentIntersect);
        
        if (currentIntersect) {
            if (deleteEnabled) {
                activeDragBody.deleteAt(currentIntersect, 0.15);
            } else {
                const delta = new THREE.Vector3().subVectors(currentIntersect, previousMousePosition);
                activeDragBody.applyInteraction(previousMousePosition, delta, true);
            }
            previousMousePosition.copy(currentIntersect);
        }
    }
}

function onPointerUp() {
    isDragging = false;
    activeDragBody = null;
    controls.enabled = true;
}

function updateMouse(event) {
    if (event.touches) {
        mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    } else {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
}

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchstart', onPointerDown, { passive: false });
window.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('touchend', onPointerUp);

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation Loop
const clock = new THREE.Clock();

function updateMovement(dt) {
    const direction = new THREE.Vector3();
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    cameraDir.y = 0;
    cameraDir.normalize();

    const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up);

    if (moveState.forward) direction.add(cameraDir);
    if (moveState.backward) direction.sub(cameraDir);
    if (moveState.left) direction.sub(cameraRight);
    if (moveState.right) direction.add(cameraRight);

    // Joystick movement
    if (moveState.joystick.x !== 0 || moveState.joystick.y !== 0) {
        const joystickDir = new THREE.Vector3();
        joystickDir.addScaledVector(cameraRight, moveState.joystick.x);
        joystickDir.addScaledVector(cameraDir, moveState.joystick.y);
        direction.add(joystickDir);
    }

    if (direction.lengthSq() > 0) {
        direction.normalize();
        const moveStep = direction.multiplyScalar(moveSpeed * dt);
        camera.position.add(moveStep);
        controls.target.add(moveStep);
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    
    updateMovement(dt);
    controls.update();
    
    softBodies.forEach(sb => sb.update(dt));
    if (webviewSoftBody) webviewSoftBody.update(dt);

    if (webviewPart && webviewEnabled && webviewSoftBody) {
        // Subtle floating animation for the mesh
        webviewPart.position.y += Math.sin(Date.now() * 0.002) * 0.001;
        
        // Sync CSS3DObject to the mesh deformation
        const cssObj = webviewPart.userData.cssObject;
        if (cssObj) {
            // Position it at the center of the mesh
            cssObj.position.copy(webviewPart.position);
            cssObj.quaternion.copy(webviewPart.quaternion);

            // Add a "wobble" tilt based on average vertex velocities
            const velocities = webviewSoftBody.velocities;
            let avgVelX = 0, avgVelY = 0;
            const step = Math.floor(velocities.length / 30); // Sample some vertices
            let samples = 0;
            for(let i=0; i<velocities.length; i += step * 3) {
                avgVelX += velocities[i];
                avgVelY += velocities[i+1];
                samples++;
            }
            avgVelX /= samples;
            avgVelY /= samples;

            // Apply procedural tilt to make the iframe look like it's reacting to the wobble
            cssObj.rotation.x += avgVelY * 0.5;
            cssObj.rotation.y += avgVelX * 0.5;
            
            // Move slightly forward to avoid clipping with the frame mesh
            const forward = new THREE.Vector3(0, 0, 0.06).applyQuaternion(cssObj.quaternion);
            cssObj.position.add(forward);
        }
    }
    
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

animate();