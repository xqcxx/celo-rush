import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
    refs,
    useGameStore,
    LANE_WIDTH,
    SEGMENT_LENGTH,
    VISIBLE_SEGMENTS,
    RECYCLE_BUFFER,
    HIT_Z,
    INVULN_AFTER_HIT,
    BLACK_CLOUD_S,
    laneFromX,
} from '../store';
import { HAZARDS, HAZARD_KINDS, POWERUP_KINDS, POWERUP_WEIGHT, type Kind } from '../data/hazards';
import { Obstacle } from './Obstacles';
import { Audio } from '../audio';

interface Item {
    id: string;
    kind: Kind;
    lane: number;
    localZ: number;
    resolved: boolean;
}
interface Segment {
    id: number;
    z: number;
    items: Item[];
}

const HAZARD_WEIGHT: Record<string, number> = { jeet: 4, redCandle: 2, rug: 2, sniper: 2, mev: 1 };

function tierFor(elapsed: number): number {
    if (elapsed < 12) return 0;
    if (elapsed < 32) return 1;
    if (elapsed < 60) return 2;
    return 3;
}

function pickHazard(tier: number): Kind {
    const pool = HAZARD_KINDS.filter((k) => HAZARDS[k].minTier <= tier);
    let total = 0;
    for (const k of pool) total += HAZARD_WEIGHT[k] ?? 1;
    let r = Math.random() * total;
    for (const k of pool) {
        r -= HAZARD_WEIGHT[k] ?? 1;
        if (r <= 0) return k;
    }
    return pool[pool.length - 1];
}

function pickPowerup(tier: number): Kind | null {
    const pool = POWERUP_KINDS.filter((k) => HAZARDS[k].minTier <= tier);
    if (!pool.length) return null;
    let total = 0;
    for (const k of pool) total += POWERUP_WEIGHT[k] ?? 1;
    let r = Math.random() * total;
    for (const k of pool) {
        r -= POWERUP_WEIGHT[k] ?? 1;
        if (r <= 0) return k;
    }
    return pool[pool.length - 1];
}

function generateSegment(id: number, z: number, tier: number, safe: boolean): Segment {
    const items: Item[] = [];
    if (!safe) {
        const lanes = [-1, 0, 1];
        const blocked = tier >= 3 ? 2 : Math.random() < 0.45 ? 2 : 1;
        const shuffled = lanes.slice().sort(() => Math.random() - 0.5);
        const blockLanes = shuffled.slice(0, blocked);
        const openLanes = lanes.filter((l) => !blockLanes.includes(l));

        blockLanes.forEach((lane, i) => {
            items.push({
                id: `${id}-h${i}`,
                kind: pickHazard(tier),
                lane,
                localZ: -SEGMENT_LENGTH * 0.5 + (Math.random() * 4 - 2),
                resolved: false,
            });
        });

        if (Math.random() < 0.22 && openLanes.length) {
            const kind = pickPowerup(tier);
            if (kind) {
                items.push({
                    id: `${id}-p`,
                    kind,
                    lane: openLanes[Math.floor(Math.random() * openLanes.length)],
                    localZ: -SEGMENT_LENGTH * 0.5,
                    resolved: false,
                });
            }
        }
    }
    return { id, z, items };
}

export function Track() {
    const runId = useGameStore((s) => s.runId);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [, setVersion] = useState(0);
    const segmentsRef = useRef<Segment[]>([]);
    const counter = useRef(0);
    segmentsRef.current = segments;

    const [groundTex, buildingTex] = useTexture(['/ground.jpg', '/building.jpg']);
    useMemo(() => {
        groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
        groundTex.repeat.set(4, 240);
        groundTex.anisotropy = 8;
        buildingTex.wrapS = buildingTex.wrapT = THREE.RepeatWrapping;
        buildingTex.repeat.set(2, 2);
    }, [groundTex, buildingTex]);

    useEffect(() => {
        counter.current = 0;
        const initial: Segment[] = [];
        for (let i = 0; i < VISIBLE_SEGMENTS; i++) {
            initial.push(generateSegment(counter.current++, -i * SEGMENT_LENGTH, 0, i < 3));
        }
        setSegments(initial);
    }, [runId]);

    useFrame(() => {
        if (useGameStore.getState().phase !== 'playing') return;
        const pos = refs.pos;

        setSegments((prev) => {
            let minZ = 0;
            for (const s of prev) if (s.z < minZ) minZ = s.z;
            let changed = false;
            const next = prev.map((s) => {
                if (s.z > pos.z + RECYCLE_BUFFER) {
                    changed = true;
                    return generateSegment(counter.current++, minZ - SEGMENT_LENGTH, tierFor(refs.elapsed), false);
                }
                return s;
            });
            return changed ? next : prev;
        });

        const lane = laneFromX(pos.x);
        const store = useGameStore.getState();
        const dashing = refs.elapsed < refs.dashUntil;
        let resolvedAny = false;

        for (const seg of segmentsRef.current) {
            if (Math.abs(seg.z - pos.z) > SEGMENT_LENGTH) continue;
            for (const it of seg.items) {
                if (it.resolved) continue;
                const wz = seg.z + it.localZ;
                if (Math.abs(wz - pos.z) > HIT_Z) continue;
                if (it.lane !== lane) continue;

                const cfg = HAZARDS[it.kind];

                if (cfg.powerup) {
                    if (it.kind === 'blackCloud') {
                        // ULTIMATE: wipe every active hazard + 5s of unstoppable
                        for (const sg of segmentsRef.current) {
                            for (const o of sg.items) {
                                if (!o.resolved && !HAZARDS[o.kind].powerup) o.resolved = true;
                            }
                        }
                        refs.invulnUntil = refs.elapsed + BLACK_CLOUD_S;
                        refs.cloudUntil = refs.elapsed + BLACK_CLOUD_S;
                        store.triggerCloud();
                        Audio.sfx('charge');
                        refs.shake = Math.max(refs.shake, 0.45);
                    } else {
                        if (it.kind === 'greenCandle') store.addScore(500);
                        else if (it.kind === 'diamondHorns') store.setShield(true);
                        else if (it.kind === 'stimmy') store.heal();
                        Audio.sfx('powerup');
                        refs.shake = Math.max(refs.shake, 0.15);
                    }
                    it.resolved = true;
                    resolvedAny = true;
                    continue;
                }

                if (dashing && cfg.dashBreakable) {
                    store.addScore(120);
                    store.addCombo();
                    Audio.sfx('break');
                    refs.shake = Math.max(refs.shake, 0.2);
                    it.resolved = true;
                    resolvedAny = true;
                    continue;
                }

                if (refs.shield) {
                    store.setShield(false);
                    Audio.sfx('break');
                    refs.shake = Math.max(refs.shake, 0.25);
                    it.resolved = true;
                    resolvedAny = true;
                    continue;
                }

                if (refs.elapsed < refs.invulnUntil) continue;

                refs.invulnUntil = refs.elapsed + INVULN_AFTER_HIT;
                refs.shake = Math.max(refs.shake, 0.45);
                Audio.sfx('hit');
                store.flashHit();
                it.resolved = true;
                resolvedAny = true;
                if (cfg.damage === 'instant') store.die(cfg.cause);
                else store.damage(cfg.damage, cfg.cause);
            }
        }

        if (resolvedAny) setVersion((v) => v + 1);
    });

    return (
        <group>
            {/* ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1900]} receiveShadow>
                <planeGeometry args={[40, 4200]} />
                <meshStandardMaterial map={groundTex} color="#7a7a7a" roughness={0.85} metalness={0.15} />
            </mesh>
            {/* lane dividers */}
            {[-0.5, 0.5].map((o) => (
                <mesh key={o} position={[o * LANE_WIDTH, 0.04, -1900]}>
                    <boxGeometry args={[0.08, 0.02, 4200]} />
                    <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={1.4} toneMapped={false} />
                </mesh>
            ))}
            {/* side rails */}
            {[-1, 1].map((s) => (
                <mesh key={s} position={[s * (LANE_WIDTH * 1.5 + 0.6), 0.6, -1900]}>
                    <boxGeometry args={[0.18, 1.2, 4200]} />
                    <meshStandardMaterial color="#39e6ff" emissive="#39e6ff" emissiveIntensity={1.2} toneMapped={false} />
                </mesh>
            ))}

            {segments.map((seg) => (
                <group key={seg.id} position={[0, 0, seg.z]}>
                    <SegmentDecor id={seg.id} buildingTex={buildingTex} />
                    {seg.items
                        .filter((it) => !it.resolved)
                        .map((it) => (
                            <group key={it.id} position={[it.lane * LANE_WIDTH, 0, it.localZ]}>
                                <Obstacle kind={it.kind} />
                            </group>
                        ))}
                </group>
            ))}
        </group>
    );
}

function SegmentDecor({ id, buildingTex }: { id: number; buildingTex: THREE.Texture }) {
    return (
        <group>
            {/* side neon buildings (textured facades — windows glow via emissiveMap) */}
            {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 11, 4 + (id % 4), -SEGMENT_LENGTH * 0.5]}>
                    <boxGeometry args={[5, 8 + (id % 5) * 2, 6]} />
                    <meshStandardMaterial
                        map={buildingTex}
                        emissiveMap={buildingTex}
                        emissive="#ffffff"
                        emissiveIntensity={0.7}
                        color="#0a0e1a"
                    />
                </mesh>
            ))}
        </group>
    );
}
