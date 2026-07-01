import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Kind } from '../data/hazards';

// Emissive neon helper — toneMapped:false makes the bloom pass really bite.
function neon(color: string, intensity = 3) {
    return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />;
}

function Spin({ speed = 1.5, children }: { speed?: number; children: ReactNode }) {
    const ref = useRef<THREE.Group>(null);
    useFrame((_, delta) => {
        if (ref.current) ref.current.rotation.y += delta * speed;
    });
    return <group ref={ref}>{children}</group>;
}

function Jeet() {
    return (
        <group position={[0, 0.7, 0]}>
            <RoundedBox args={[1.1, 1.3, 1.1]} radius={0.18} castShadow>
                <meshStandardMaterial color="#ff2d3a" emissive="#ff2d3a" emissiveIntensity={1.6} toneMapped={false} />
            </RoundedBox>
            <mesh position={[-0.25, 0.25, 0.56]}>
                <sphereGeometry args={[0.13, 12, 12]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} toneMapped={false} />
            </mesh>
            <mesh position={[0.25, 0.25, 0.56]}>
                <sphereGeometry args={[0.13, 12, 12]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.1, 0.57]}>
                <boxGeometry args={[0.5, 0.12, 0.05]} />
                <meshBasicMaterial color="#000000" />
            </mesh>
        </group>
    );
}

function RedCandle() {
    return (
        <group position={[0, 0, 0]}>
            <mesh position={[0, 1.5, 0]} castShadow>
                <boxGeometry args={[1.2, 3, 1.2]} />
                <meshStandardMaterial color="#c81e2d" emissive="#ff2d3a" emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
            <mesh position={[0, 3.3, 0]}>
                <boxGeometry args={[0.12, 0.7, 0.12]} />
                {neon('#ffffff', 2)}
            </mesh>
        </group>
    );
}

function Rug() {
    return (
        <group position={[0, 0.05, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[1.4, 32]} />
                <meshBasicMaterial color="#01010a" />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[1.2, 1.45, 32]} />
                {neon('#ff2d3a', 2.5)}
            </mesh>
        </group>
    );
}

function Sniper() {
    return (
        <group position={[0, 1.8, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.7, 0.08, 12, 28]} />
                {neon('#ff1f4f', 4)}
            </mesh>
            <mesh>
                <boxGeometry args={[1.8, 0.06, 0.06]} />
                {neon('#ff1f4f', 4)}
            </mesh>
            <mesh>
                <boxGeometry args={[0.06, 1.8, 0.06]} />
                {neon('#ff1f4f', 4)}
            </mesh>
            <mesh position={[0, -1.8, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 3.6, 8]} />
                <meshStandardMaterial color="#ff1f4f" emissive="#ff1f4f" emissiveIntensity={3} transparent opacity={0.5} toneMapped={false} />
            </mesh>
        </group>
    );
}

function Mev() {
    return (
        <group position={[0, 1.6, 0]}>
            <mesh castShadow>
                <boxGeometry args={[2.7, 3.2, 0.6]} />
                <meshStandardMaterial color="#2a0a4a" emissive="#8a2be2" emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
            {[-1, 0, 1].map((i) => (
                <mesh key={i} position={[0, i * 0.9, 0.32]}>
                    <boxGeometry args={[2.7, 0.18, 0.05]} />
                    {neon(i % 2 ? '#39ff14' : '#39e6ff', 3)}
                </mesh>
            ))}
        </group>
    );
}

function Candlestick({ color }: { color: string }) {
    return (
        <group position={[0, 0, 0]}>
            <mesh position={[0, 1.4, 0]}>
                <boxGeometry args={[1, 2.6, 1]} />
                {neon(color, 2)}
            </mesh>
            <mesh position={[0, 3, 0]}>
                <boxGeometry args={[0.1, 0.6, 0.1]} />
                {neon('#ffffff', 2)}
            </mesh>
        </group>
    );
}

export function Obstacle({ kind }: { kind: Kind }) {
    switch (kind) {
        case 'jeet':
            return <Jeet />;
        case 'redCandle':
            return <RedCandle />;
        case 'rug':
            return <Rug />;
        case 'sniper':
            return <Sniper />;
        case 'mev':
            return <Mev />;
        case 'greenCandle':
            return (
                <Spin>
                    <Candlestick color="#39ff14" />
                </Spin>
            );
        case 'diamondHorns':
            return (
                <Spin speed={2}>
                    <group position={[0, 1.6, 0]}>
                        <mesh>
                            <octahedronGeometry args={[0.7, 0]} />
                            {neon('#7fffd4', 3)}
                        </mesh>
                    </group>
                </Spin>
            );
        case 'stimmy':
            return (
                <Spin speed={2}>
                    <group position={[0, 1.5, 0]}>
                        <mesh>
                            <boxGeometry args={[0.4, 1.2, 0.4]} />
                            {neon('#ff4fd8', 3)}
                        </mesh>
                        <mesh>
                            <boxGeometry args={[1.2, 0.4, 0.4]} />
                            {neon('#ff4fd8', 3)}
                        </mesh>
                    </group>
                </Spin>
            );
        case 'blackCloud':
            return (
                <Spin speed={0.8}>
                    <group position={[0, 1.7, 0]}>
                        <mesh position={[-0.55, 0, 0]}>
                            <sphereGeometry args={[0.6, 14, 14]} />
                            <meshStandardMaterial color="#0a0a14" emissive="#39ff14" emissiveIntensity={0.7} toneMapped={false} />
                        </mesh>
                        <mesh position={[0.55, 0, 0]}>
                            <sphereGeometry args={[0.6, 14, 14]} />
                            <meshStandardMaterial color="#0a0a14" emissive="#8a2be2" emissiveIntensity={0.7} toneMapped={false} />
                        </mesh>
                        <mesh position={[0, 0.4, 0]}>
                            <sphereGeometry args={[0.72, 14, 14]} />
                            <meshStandardMaterial color="#05050a" emissive="#39ff14" emissiveIntensity={0.5} toneMapped={false} />
                        </mesh>
                    </group>
                </Spin>
            );
    }
}
