import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { Suspense, useRef } from 'react';
import type { Mesh } from 'three';

function DistortBlob() {
	const ref = useRef<Mesh>(null);
	useFrame((state) => {
		const m = ref.current;
		if (!m) return;
		m.rotation.x = state.clock.elapsedTime * 0.07;
		m.rotation.y = state.clock.elapsedTime * 0.11;
	});
	return (
		<Float speed={1.2} rotationIntensity={0.35} floatIntensity={0.45}>
			<Sphere ref={ref} args={[1, 48, 48]} scale={2.4}>
				<MeshDistortMaterial
					color="#7c3aed"
					attach="material"
					distort={0.32}
					speed={1.4}
					roughness={0.25}
					metalness={0.75}
				/>
			</Sphere>
		</Float>
	);
}

export default function HeroThreeCanvas() {
	const reduce = useReducedMotion();

	if (reduce) {
		return null;
	}

	return (
		<div
			className="pointer-events-none absolute inset-0 z-[1] min-h-[100svh] w-full opacity-[0.38]"
			aria-hidden="true"
		>
			<Canvas
				camera={{ position: [0, 0, 5.2], fov: 42 }}
				gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
				dpr={[1, 1.75]}
			>
				<ambientLight intensity={0.55} />
				<directionalLight position={[6, 6, 4]} intensity={1.1} />
				<pointLight position={[-6, -4, -2]} color="#ec4899" intensity={0.65} />
				<Suspense fallback={null}>
					<DistortBlob />
				</Suspense>
			</Canvas>
		</div>
	);
}
