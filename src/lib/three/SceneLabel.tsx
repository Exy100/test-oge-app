import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

/** Plain text labels share the existing renderer; no second React DOM root is needed. */
export default function SceneLabel({
  text,
  position,
}: {
  text: string;
  position: readonly [number, number, number];
}) {
  const { gl, invalidate } = useThree();
  const label = useRef<HTMLSpanElement | null>(null);
  const projected = useRef(new Vector3());
  useLayoutEffect(() => {
    const element = document.createElement('span');
    element.className = 'three-node-label';
    element.setAttribute('aria-hidden', 'true');
    element.textContent = text;
    gl.domElement.parentElement?.appendChild(element);
    label.current = element;
    invalidate();
    return () => {
      label.current = null;
      element.remove();
    };
  }, [gl, invalidate, text]);
  useFrame(({ camera, size }) => {
    projected.current.set(...position).project(camera);
    if (label.current)
      label.current.style.transform = `translate(${String(((projected.current.x + 1) * size.width) / 2)}px, ${String(((1 - projected.current.y) * size.height) / 2)}px) translate(-50%, -50%)`;
  });
  return null;
}
