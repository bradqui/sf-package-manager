export interface DependencyNode {
  id: string;
  name: string;
  namespace: string;
  versionId: string;
  versionNumber: string;
  level: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export class DependencyGraphService {
  createGraph(rootPackageName: string, dependencies: any[]): DependencyGraph {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];

    // Add root node
    const rootId = 'root';
    nodes.push({
      id: rootId,
      name: rootPackageName,
      namespace: '',
      versionId: '',
      versionNumber: '',
      level: 0
    });

    // Add dependency nodes and edges
    dependencies.forEach((dep, index) => {
      const depId = `dep-${index}`;

      nodes.push({
        id: depId,
        name: dep.subscriberPackageName || 'Unknown',
        namespace: dep.subscriberPackageNamespace || '',
        versionId: dep.subscriberPackageVersionId || '',
        versionNumber: dep.versionNumber || '',
        level: 1
      });

      edges.push({
        from: rootId,
        to: depId
      });
    });

    return { nodes, edges };
  }

  generateSVG(graph: DependencyGraph, width: number = 800, height: number = 600): string {
    const nodeRadius = 40;
    const levelHeight = 150;

    // Calculate positions for nodes
    const nodePositions: Map<string, { x: number; y: number }> = new Map();

    // Position nodes by level
    const levelGroups: Map<number, DependencyNode[]> = new Map();
    graph.nodes.forEach(node => {
      if (!levelGroups.has(node.level)) {
        levelGroups.set(node.level, []);
      }
      levelGroups.get(node.level)!.push(node);
    });

    levelGroups.forEach((nodesInLevel, level) => {
      const y = 80 + (level * levelHeight);
      const spacing = Math.min(width / (nodesInLevel.length + 1), 200);

      nodesInLevel.forEach((node, index) => {
        const x = (width / 2) - ((nodesInLevel.length - 1) * spacing / 2) + (index * spacing);
        nodePositions.set(node.id, { x, y });
      });
    });

    // Generate SVG elements
    let edgesSvg = '';
    graph.edges.forEach(edge => {
      const fromPos = nodePositions.get(edge.from);
      const toPos = nodePositions.get(edge.to);

      if (fromPos && toPos) {
        // Create arrow path
        edgesSvg += `
          <defs>
            <marker id="arrowhead-${edge.from}-${edge.to}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>
          <line
            x1="${fromPos.x}"
            y1="${fromPos.y + nodeRadius}"
            x2="${toPos.x}"
            y2="${toPos.y - nodeRadius}"
            stroke="#6b7280"
            stroke-width="2"
            marker-end="url(#arrowhead-${edge.from}-${edge.to})"
          />
        `;
      }
    });

    let nodesSvg = '';
    graph.nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const isRoot = node.level === 0;
      const fillColor = isRoot ? '#3b82f6' : '#10b981';
      const textColor = '#ffffff';

      nodesSvg += `
        <g class="node" data-id="${node.id}">
          <circle
            cx="${pos.x}"
            cy="${pos.y}"
            r="${nodeRadius}"
            fill="${fillColor}"
            stroke="#1f2937"
            stroke-width="2"
          />
          <text
            x="${pos.x}"
            y="${pos.y - 5}"
            text-anchor="middle"
            fill="${textColor}"
            font-size="12"
            font-weight="bold"
          >
            ${this.truncateText(node.name, 12)}
          </text>
          ${node.namespace ? `
            <text
              x="${pos.x}"
              y="${pos.y + 10}"
              text-anchor="middle"
              fill="${textColor}"
              font-size="10"
            >
              ${node.namespace}
            </text>
          ` : ''}
          ${node.versionNumber ? `
            <text
              x="${pos.x}"
              y="${pos.y + nodeRadius + 15}"
              text-anchor="middle"
              fill="#6b7280"
              font-size="10"
            >
              v${node.versionNumber}
            </text>
          ` : ''}
        </g>
      `;
    });

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .node { cursor: pointer; }
          .node:hover circle { filter: brightness(1.2); }
        </style>
        ${edgesSvg}
        ${nodesSvg}
      </svg>
    `;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  generateMermaidDiagram(graph: DependencyGraph): string {
    let mermaid = 'graph TD\n';

    // Add nodes
    graph.nodes.forEach(node => {
      const label = node.namespace
        ? `${node.name}\\n${node.namespace}`
        : node.name;

      if (node.level === 0) {
        mermaid += `  ${node.id}["${label}"]\n`;
        mermaid += `  style ${node.id} fill:#3b82f6,stroke:#1f2937,stroke-width:2px,color:#fff\n`;
      } else {
        mermaid += `  ${node.id}["${label}\\nv${node.versionNumber}"]\n`;
        mermaid += `  style ${node.id} fill:#10b981,stroke:#1f2937,stroke-width:2px,color:#fff\n`;
      }
    });

    // Add edges
    mermaid += '\n';
    graph.edges.forEach(edge => {
      mermaid += `  ${edge.from} --> ${edge.to}\n`;
    });

    return mermaid;
  }
}
