import { Component, Suspense, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { KTX2Loader, SkeletonUtils, type GLTFLoader } from "three-stdlib";
import { Box3, Vector3, type WebGLRenderer } from "three";

interface CreatureViewerProps {
  url: string | null | undefined;
}

/**
 * The .glb files carry KTX2/Basis textures (KHR_texture_basisu, marked
 * required), so the GLTFLoader needs a KTX2Loader or the load throws outright.
 *
 * One loader for the whole app: each instance spins up its own worker pool for
 * transcoding, and there is no reason to pay for more than one.
 */
let ktx2Loader: KTX2Loader | null = null;

function getKTX2Loader(gl: WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    // Files live in public/basis/, copied from three's examples/jsm/libs/basis.
    ktx2Loader = new KTX2Loader().setTranscoderPath("/basis/");
  }
  // Picks the transcode target (BC7, ASTC, ETC2…) from what the GPU actually
  // supports. Must run before the first transcode; cheap to repeat.
  ktx2Loader.detectSupport(gl);
  return ktx2Loader;
}

/**
 * Turntable inspector for the creature's .glb.
 *
 * This is the ONE place in the app where the camera-e-perspectiva rule of
 * "no rotation, no zoom" is deliberately broken — the doc calls out
 * "bestiário/vitrina de criatura" as the free-orbit exception. The initial
 * camera sits near the game's isometric angle so what the reader sees first
 * matches what the game shows.
 *
 * Materials come from the .glb as authored by Meshy; the cel-shaded toon
 * shader that the game applies is not reproduced here. This is documentation
 * of the mesh, not a preview of gameplay lighting.
 */
export function CreatureViewer({ url }: CreatureViewerProps) {
  if (!url) {
    return (
      <div className="flex h-[360px] items-center justify-center border border-graphite/40 bg-void">
        <div className="text-center">
          <p className="font-mono text-micro uppercase tracking-widest text-graphite">
            modelo 3D
          </p>
          <p className="mt-3 font-sans text-xs text-bone/50">
            não anexado — modelo ainda em produção
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[360px] border border-graphite/40 bg-void">
      <ModelStage url={url} />
      <p className="pointer-events-none absolute left-3 top-3 font-mono text-micro uppercase tracking-widest text-graphite/70">
        modelo 3D · turntable
      </p>
    </div>
  );
}

/**
 * A missing or corrupt .glb throws from inside useGLTF's Suspense, and without
 * a boundary that unmounts the entire route — a blank page because one model
 * URL went stale. Caught here so the ficha stays readable; keyed by url at the
 * call site so picking another model retries.
 */
class StageErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center">
        <p className="px-6 text-center font-sans text-xs text-bone/50">
          falha ao carregar o modelo — o arquivo pode ter sido removido.
          Sincronize os modelos ou vincule outro.
        </p>
      </div>
    );
  }
}

/**
 * The bare 3D stage — canvas, lights, auto-framed model, turntable orbit.
 * `CreatureViewer` wraps it for the ficha; the model picker reuses it for
 * placeholder previews.
 */
export function ModelStage({ url }: { url: string }) {
  return (
    <StageErrorBoundary key={url}>
      <StageCanvas url={url} />
    </StageErrorBoundary>
  );
}

function StageCanvas({ url }: { url: string }) {
  return (
    <Canvas
      camera={{ position: [1.6, 1.1, 1.6], fov: 32 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} />
      <directionalLight position={[-2, -1, -3]} intensity={0.3} />
      <Suspense fallback={null}>
        <Model url={url} />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom
        autoRotate
        autoRotateSpeed={0.6}
        minDistance={0.6}
        maxDistance={6}
      />
    </Canvas>
  );
}

function Model({ url }: { url: string }) {
  const gl = useThree((state) => state.gl);
  const extendLoader = useCallback(
    (loader: GLTFLoader) => {
      loader.setKTX2Loader(getKTX2Loader(gl));
    },
    [gl],
  );
  // useDraco/useMeshopt stay at drei's defaults — passing undefined keeps the
  // previous behaviour untouched; only the KTX2 hookup is new.
  const gltf = useGLTF(url, undefined, undefined, extendLoader);

  // useGLTF caches by URL and shares one scene graph. A three object has a
  // single parent, so mounting the cached scene in two canvases at once (ficha
  // + model picker on the same url) silently steals it from the first. Clone
  // per mount — SkeletonUtils, because a plain .clone() breaks skinned meshes.
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);

  // Placeholders carry a normalized clip vocabulary (see
  // scripts/convert-placeholders.mjs); `Idle` is the resting loop in every
  // family. A model without animations just stands still.
  const { actions, names } = useAnimations(gltf.animations, scene);
  useEffect(() => {
    const name = names.includes("Idle") ? "Idle" : names[0];
    if (!name) return;
    const action = actions[name];
    action?.reset().fadeIn(0.2).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, names]);

  // Models arrive at wildly different sizes (Meshy ~1 unit tall, placeholder
  // packs 1.4–5.4), so fit the largest dimension to the fixed camera instead
  // of trusting the file's scale.
  const { scale, position } = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const factor = 1.2 / maxDim;
    const center = box.getCenter(new Vector3()).multiplyScalar(factor);
    return { scale: factor, position: [-center.x, -center.y, -center.z] as [number, number, number] };
  }, [scene]);

  return (
    <group scale={scale} position={position}>
      <primitive object={scene} />
    </group>
  );
}
