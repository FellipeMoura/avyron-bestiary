import { Suspense, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { KTX2Loader, type GLTFLoader } from "three-stdlib";
import type { WebGLRenderer } from "three";

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
      <p className="pointer-events-none absolute left-3 top-3 font-mono text-micro uppercase tracking-widest text-graphite/70">
        modelo 3D · turntable
      </p>
    </div>
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
  return <primitive object={gltf.scene} />;
}
