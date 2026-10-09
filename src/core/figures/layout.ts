export interface DiagramNode {
  id: string;
  label: string;
}
export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

// Every connection owns a separate lane. Labels occupy disjoint vertical bands.
// Fixed advances also reserve space for arbitrary Cyrillic and Unicode labels.
export function layoutDiagram(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const boxWidth = Math.max(
    100,
    ...nodes.map((node) => Array.from(node.label).length * 18 + 32),
    ...edges.map((edge) => Array.from(edge.label ?? '').length * 18 + 32),
  );
  const gap = Math.max(
    64,
    ...edges.map((edge) => Array.from(edge.label ?? '').length * 18 + 32),
  );
  const stride = boxWidth + gap;
  const baseline = edges.length * 48 + 64;
  const positions = nodes.map((node, index) => ({
    ...node,
    x: 32 + index * stride,
    y: baseline,
    width: boxWidth,
    height: 48,
  }));
  const byId = new Map(positions.map((node) => [node.id, node]));
  const degrees = new Map(
    nodes.map((node) => [
      node.id,
      edges.filter((edge) => edge.from === node.id || edge.to === node.id)
        .length,
    ]),
  );
  const used = new Map<string, number>();
  function port(node: (typeof positions)[number]) {
    const ordinal = (used.get(node.id) ?? 0) + 1;
    used.set(node.id, ordinal);
    return (
      node.x +
      16 +
      ((boxWidth - 32) * ordinal) / ((degrees.get(node.id) ?? 0) + 1)
    );
  }
  const connections = edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new Error('Неизвестная вершина рисунка.');
    const x1 = port(from);
    const x2 = port(to);
    const y = 32 + index * 48;
    return {
      ...edge,
      x: Math.min(from.x, to.x) + boxWidth + gap / 2,
      y,
      path: `M ${String(x1)} ${String(baseline)} L ${String(x1)} ${String(y)} L ${String(x2)} ${String(y)} L ${String(x2)} ${String(baseline - 6)}`,
    };
  });
  return {
    nodes: positions,
    edges: connections,
    width: nodes.length * stride,
    height: baseline + 80,
  };
}
