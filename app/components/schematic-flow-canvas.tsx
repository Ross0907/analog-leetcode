"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the drawing surface is a keyboard-operable application and a drag/drop target. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectStartParams,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import {
  getSmartEdgeWaypoints,
  isDirectPathBlocked,
  pathfindingJumpPointNoDiagonal,
  SmartEdgeProvider,
  svgDrawStraightLinePath,
  useSmartEdgePath,
} from "@tisoap/react-flow-smart-edge";
import { SchematicSymbol, symbolPins } from "./schematic-symbol";
import type {
  CircuitDocument,
  Endpoint,
  SchematicPart,
  Selection,
  Tool,
} from "./textbook-schematic-editor";

const GRID = 10;
const WORLD = { width: 1_600, height: 900 };
const PART_WIDTH = 150;
const PART_HEIGHT = 132;
const JUNCTION_SIZE = 20;
const ROUTER_CLEARANCE = 8;
const COORD_EPSILON = 0.01;

type PartNodeData = {
  part: SchematicPart;
  connectedPins: number[];
  tool: Tool;
};

type JunctionNodeData = {
  junctionId: string;
  label?: string;
  degree: number;
};

type PartFlowNode = Node<PartNodeData, "schematic-part">;
type JunctionFlowNode = Node<JunctionNodeData, "schematic-junction">;
type SchematicFlowNode = PartFlowNode | JunctionFlowNode;
type WireEditPhase = "start" | "move" | "stop";
type SchematicEdgeData = Record<string, unknown> & {
  waypoints: XYPosition[];
  sourcePoint?: XYPosition;
  targetPoint?: XYPosition;
  onStretch(points: XYPosition[], phase: WireEditPhase): void;
};
type SchematicFlowEdge = Edge<SchematicEdgeData, "schematic">;

type MovePhase = "start" | "move" | "stop";

export type SchematicFlowCanvasProps = {
  document: CircuitDocument;
  selection: Selection;
  tool: Tool;
  onPlacePart(kind: Exclude<Tool, "select" | "pan" | "wire">, position: XYPosition): void;
  onSelectionChange(partIds: string[], wireId: string | null): void;
  onMoveParts(parts: Array<{ id: string; x: number; y: number }>, phase: MovePhase): void;
  onConnect(from: Endpoint, to: Endpoint): void;
  onBranchWire(from: Endpoint, wireId: string, position: XYPosition, routePoints: XYPosition[]): void;
  onWirePointsChange(wireId: string, points: XYPosition[], phase: WireEditPhase): void;
  onDeleteWire(wireId: string): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
  onMessage(message: string): void;
};

const edgeTypes = {
  schematic: SchematicWireEdge,
};

const nodeTypes = {
  "schematic-part": SchematicPartNode,
  "schematic-junction": SchematicJunctionNode,
};

export function SchematicFlowCanvas(props: SchematicFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <SchematicFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function SchematicFlowCanvasInner({
  document,
  selection,
  tool,
  onPlacePart,
  onSelectionChange: onEditorSelectionChange,
  onMoveParts,
  onConnect,
  onBranchWire,
  onWirePointsChange,
  onDeleteWire,
  onKeyDown,
  onMessage,
}: SchematicFlowCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReactFlowInstance<SchematicFlowNode, SchematicFlowEdge> | null>(null);
  const activeConnectionRef = useRef<Endpoint | null>(null);
  const autoFitRef = useRef(true);
  const { getViewport, setViewport, screenToFlowPosition } = useReactFlow<SchematicFlowNode, SchematicFlowEdge>();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      // The persisted problem-pane width is restored after hydration. Fit
      // against that final canvas size, and keep following pane resizes until
      // the learner deliberately pans or zooms the view.
      timer = setTimeout(() => {
        if (autoFitRef.current && wrapper.clientWidth && wrapper.clientHeight) {
          void instanceRef.current?.fitView({ padding: 0.08, minZoom: 0.2, maxZoom: 1.4 });
        }
      }, 100);
    });
    observer.observe(wrapper);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  const pinDegrees = useMemo(() => {
    const counts = new Map<string, number[]>();
    for (const part of document.parts) counts.set(part.id, symbolPins(part.kind).map(() => 0));
    for (const wire of document.wires) {
      for (const endpoint of [wire.from, wire.to]) {
        if (endpoint.type !== "pin") continue;
        const pins = counts.get(endpoint.partId);
        if (pins) pins[endpoint.pin] = (pins[endpoint.pin] ?? 0) + 1;
      }
    }
    return counts;
  }, [document.parts, document.wires]);

  const junctionDegrees = useMemo(() => {
    const counts = new Map(document.junctions.map((junction) => [junction.id, 0]));
    for (const wire of document.wires) {
      for (const endpoint of [wire.from, wire.to]) {
        if (endpoint.type === "junction") counts.set(endpoint.junctionId, (counts.get(endpoint.junctionId) ?? 0) + 1);
      }
    }
    return counts;
  }, [document.junctions, document.wires]);

  const nodes = useMemo<SchematicFlowNode[]>(() => [
    ...document.parts.map<PartFlowNode>((part) => ({
      id: part.id,
      type: "schematic-part",
      position: { x: part.x - PART_WIDTH / 2, y: part.y - PART_HEIGHT / 2 },
      width: PART_WIDTH,
      height: PART_HEIGHT,
      measured: { width: PART_WIDTH, height: PART_HEIGHT },
      selected: selection.partIds.includes(part.id),
      draggable: tool === "select",
      selectable: tool === "select",
      deletable: false,
      data: { part, connectedPins: pinDegrees.get(part.id) ?? [], tool },
      ariaLabel: `${part.id}, ${part.kind}${part.value ? `, ${part.value}` : ""}`,
    })),
    ...document.junctions.map<JunctionFlowNode>((junction) => ({
      id: junctionNodeId(junction.id),
      type: "schematic-junction",
      position: { x: junction.x - JUNCTION_SIZE / 2, y: junction.y - JUNCTION_SIZE / 2 },
      width: JUNCTION_SIZE,
      height: JUNCTION_SIZE,
      measured: { width: JUNCTION_SIZE, height: JUNCTION_SIZE },
      draggable: false,
      selectable: false,
      deletable: false,
      focusable: false,
      data: {
        junctionId: junction.id,
        label: junction.label,
        degree: junctionDegrees.get(junction.id) ?? 0,
      },
    })),
  ], [document.junctions, document.parts, junctionDegrees, pinDegrees, selection.partIds, tool]);

  // Junctions are electrical topology, not physical obstacles. Feeding their
  // tiny React Flow nodes to the router made otherwise straight nets detour
  // around their own connection points.
  const routingNodes = useMemo(
    () => nodes.filter((node): node is PartFlowNode => node.type === "schematic-part").map(toRoutingObstacleNode),
    [nodes],
  );

  const edges = useMemo<SchematicFlowEdge[]>(() => document.wires.map((wire) => {
    const source = endpointToFlow(wire.from, wire.to, document);
    const target = endpointToFlow(wire.to, wire.from, document);
    const selected = selection.wireId === wire.id;
    return {
      id: wire.id,
      source: source.nodeId,
      sourceHandle: source.handleId,
      target: target.nodeId,
      targetHandle: target.handleId,
      type: "schematic",
      selected,
      selectable: true,
      deletable: false,
      focusable: true,
      interactionWidth: 18,
      className: "schematic-flow-wire",
      style: { stroke: "var(--schematic-wire)", strokeWidth: selected ? 2.7 : 2, fill: "none" },
      data: {
        waypoints: wire.waypoints,
        sourcePoint: endpointWorldPosition(wire.from, document) ?? undefined,
        targetPoint: endpointWorldPosition(wire.to, document) ?? undefined,
        onStretch: (points, phase) => onWirePointsChange(wire.id, points, phase),
      },
    };
  }), [document, onWirePointsChange, selection.wireId]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      autoFitRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      const bounds = wrapper.getBoundingClientRect();
      const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const current = getViewport();
      const zoom = clamp(current.zoom * Math.exp(-event.deltaY * 0.0016), 0.2, 2.8);
      void setViewport({
        x: event.clientX - bounds.left - pointer.x * zoom,
        y: event.clientY - bounds.top - pointer.y * zoom,
        zoom,
      }, { duration: 0 });
    };
    wrapper.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel, { capture: true });
  }, [getViewport, screenToFlowPosition, setViewport]);

  const handleConnect = useCallback((connection: Connection) => {
    const from = flowToEndpoint(connection.source, connection.sourceHandle, document);
    const to = flowToEndpoint(connection.target, connection.targetHandle, document);
    activeConnectionRef.current = null;
    if (!from || !to) return;
    onConnect(from, to);
  }, [document, onConnect]);

  const rememberConnectionStart = useCallback((_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    activeConnectionRef.current = flowToEndpoint(params.nodeId, params.handleId, document);
    if (activeConnectionRef.current) onMessage("Wire started · click another pin or an existing wire to connect");
  }, [document, onMessage]);

  const handleNodesChange = useCallback((changes: NodeChange<SchematicFlowNode>[]) => {
    const positions: Array<{ id: string; x: number; y: number }> = [];
    const selectedPartIds = new Set(selection.partIds);
    let selectionChanged = false;
    for (const change of changes) {
      if (change.type === "select" && !change.id.startsWith("junction:")) {
        selectionChanged = true;
        if (change.selected) selectedPartIds.add(change.id);
        else selectedPartIds.delete(change.id);
        continue;
      }
      if (change.type !== "position" || !change.position || change.id.startsWith("junction:")) continue;
      positions.push({
        id: change.id,
        x: clamp(snap(change.position.x + PART_WIDTH / 2), 60, WORLD.width - 60),
        y: clamp(snap(change.position.y + PART_HEIGHT / 2), 60, WORLD.height - 60),
      });
    }
    if (positions.length) onMoveParts(positions, "move");
    if (selectionChanged) onEditorSelectionChange([...selectedPartIds], null);
  }, [onEditorSelectionChange, onMoveParts, selection.partIds]);

  const handleEdgesChange = useCallback((changes: EdgeChange<SchematicFlowEdge>[]) => {
    for (const change of changes) {
      if (change.type === "remove") {
        onDeleteWire(change.id);
        continue;
      }
      if (change.type === "select" && change.selected) {
        onEditorSelectionChange([], change.id);
        continue;
      }
      if (change.type === "select" && !change.selected && selection.wireId === change.id) {
        onEditorSelectionChange([], null);
      }
    }
  }, [onDeleteWire, onEditorSelectionChange, selection.wireId]);

  const placeFromEvent = useCallback((kind: string, clientX: number, clientY: number) => {
    if (!isPlaceableTool(kind)) return;
    onPlacePart(kind, screenToFlowPosition({ x: clientX, y: clientY }));
  }, [onPlacePart, screenToFlowPosition]);

  return (
    <div
      ref={wrapperRef}
      className={`schematic-flow-canvas tool-${tool}`}
      role="application"
      aria-label="Interactive schematic editor"
      aria-describedby="schematic-keyboard-help"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-anacode-symbol")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        placeFromEvent(event.dataTransfer.getData("application/x-anacode-symbol"), event.clientX, event.clientY);
      }}
    >
      <SmartEdgeProvider
        nodes={routingNodes}
        options={{
          preset: "step",
          gridRatio: GRID,
          nodePadding: ROUTER_CLEARANCE,
          routeOnlyWhenBlocked: true,
          routeWhileDragging: true,
          debounceMs: 8,
        }}
      >
        <ReactFlow<SchematicFlowNode, SchematicFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(instance) => { instanceRef.current = instance; }}
          onMoveStart={(event) => { if (event) autoFitRef.current = false; }}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onConnectStart={rememberConnectionStart}
          onClickConnectStart={rememberConnectionStart}
          onConnectEnd={() => { activeConnectionRef.current = null; }}
          onClickConnectEnd={() => { activeConnectionRef.current = null; }}
          onNodeDragStart={(_event, _node, draggedNodes) => {
            onMoveParts(draggedNodes.filter((node) => !node.id.startsWith("junction:")).map((node) => ({
              id: node.id,
              x: snap(node.position.x + PART_WIDTH / 2),
              y: snap(node.position.y + PART_HEIGHT / 2),
            })), "start");
          }}
          onNodeDragStop={(_event, _node, draggedNodes) => {
            onMoveParts(draggedNodes.filter((node) => !node.id.startsWith("junction:")).map((node) => ({
              id: node.id,
              x: snap(node.position.x + PART_WIDTH / 2),
              y: snap(node.position.y + PART_HEIGHT / 2),
            })), "stop");
          }}
          onEdgeClick={(event, edge) => {
            event.stopPropagation();
            const source = activeConnectionRef.current;
            if (source) {
              const path = (event.target as Element).closest(".react-flow__edge")?.querySelector(".react-flow__edge-path");
              const values = (path?.getAttribute("d")?.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number);
              const points = values.length <= 1024 ? Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] })) : [];
              onBranchWire(source, edge.id, screenToFlowPosition({ x: event.clientX, y: event.clientY }), points);
              activeConnectionRef.current = null;
              return;
            }
            onEditorSelectionChange([], edge.id);
          }}
          onPaneClick={(event) => {
            if (isPlaceableTool(tool)) {
              placeFromEvent(tool, event.clientX, event.clientY);
              return;
            }
            onEditorSelectionChange([], null);
          }}
          isValidConnection={(connection) => {
            const from = flowToEndpoint(connection.source ?? null, connection.sourceHandle ?? null, document);
            const to = flowToEndpoint(connection.target ?? null, connection.targetHandle ?? null, document);
            return Boolean(from && to && !sameEndpoint(from, to) && !document.wires.some((wire) => sameConnection(wire, from, to)));
          }}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Step}
          connectionLineStyle={{ stroke: "var(--schematic-wire-active)", strokeWidth: 2, fill: "none" }}
          connectOnClick
          snapToGrid
          snapGrid={[GRID, GRID]}
          nodeExtent={[[0, 0], [WORLD.width, WORLD.height]]}
          nodesDraggable={tool === "select"}
          nodesConnectable={tool !== "pan"}
          elementsSelectable={tool === "select" || tool === "wire"}
          selectionOnDrag={tool === "select"}
          selectionMode={SelectionMode.Partial}
          panOnDrag={tool === "pan" ? [0, 1, 2] : [1, 2]}
          panOnScroll
          panOnScrollSpeed={0.8}
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          minZoom={0.2}
          maxZoom={2.8}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: 0.2, maxZoom: 1.4 }}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          selectionKeyCode={null}
          attributionPosition="bottom-left"
          colorMode="light"
        >
          <Background variant={BackgroundVariant.Dots} gap={10} size={1} color="var(--schematic-grid-dot)" />
          <Controls
            showInteractive={false}
            position="bottom-right"
            onFitView={() => { autoFitRef.current = true; }}
            onZoomIn={() => { autoFitRef.current = false; }}
            onZoomOut={() => { autoFitRef.current = false; }}
          />
        </ReactFlow>
      </SmartEdgeProvider>
    </div>
  );
}

/**
 * Smart Edge owns obstacle pathfinding, but this renderer owns the final
 * circuit geometry. It redraws every worker result through the exact
 * electrical pin coordinates as an orthogonal polyline, so a hit-area offset,
 * crossing decoration, or sub-grid rounding can never introduce a diagonal.
 */
function SchematicWireEdge(props: EdgeProps<SchematicFlowEdge>) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
    style,
    markerStart,
    markerEnd,
    interactionWidth,
  } = props;
  const { getNodes, screenToFlowPosition } = useReactFlow<SchematicFlowNode, SchematicFlowEdge>();
  const [previewWaypoints, setPreviewWaypoints] = useState<XYPosition[] | null>(null);
  const previewRef = useRef<XYPosition[] | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    segmentIndex: number;
    start: XYPosition;
    polyline: XYPosition[];
  } | null>(null);

  const edgeData: SchematicEdgeData = data ?? { waypoints: [], onStretch: () => undefined };
  const storedWaypoints = edgeData.waypoints;
  const activeWaypoints = previewWaypoints ?? storedWaypoints;
  const exactSource = edgeData.sourcePoint ?? { x: sourceX, y: sourceY };
  const exactTarget = edgeData.targetPoint ?? { x: targetX, y: targetY };
  const authoredPolyline = buildOrthogonalPolyline(
    exactSource,
    exactTarget,
    sourcePosition,
    targetPosition,
    activeWaypoints,
  );
  const partNodes = getNodes()
    .filter((node): node is PartFlowNode => node.type === "schematic-part")
    .map(toRoutingObstacleNode);
  const isPreviewing = previewWaypoints !== null;
  const { route } = useSmartEdgePath({
    id,
    source,
    target,
    sourceX: exactSource.x,
    sourceY: exactSource.y,
    targetX: exactTarget.x,
    targetY: exactTarget.y,
    sourcePosition,
    targetPosition,
    preset: "step",
    options: { gridRatio: GRID, nodePadding: ROUTER_CLEARANCE },
    waypoints: storedWaypoints,
  });
  let routingPoints = !isPreviewing && route?.kind === "routed" ? route.points : null;
  if (!isPreviewing && !routingPoints && storedWaypoints.length > 0 && wirePolylineBlocked(authoredPolyline, partNodes, source, target)) {
    const routed = getSmartEdgeWaypoints({
      nodes: partNodes,
      sourceX: exactSource.x,
      sourceY: exactSource.y,
      targetX: exactTarget.x,
      targetY: exactTarget.y,
      sourcePosition,
      targetPosition,
      waypoints: storedWaypoints,
      options: {
        gridRatio: GRID,
        nodePadding: ROUTER_CLEARANCE,
        drawEdge: svgDrawStraightLinePath,
        generatePath: pathfindingJumpPointNoDiagonal,
      },
    });
    if (!(routed instanceof Error)) routingPoints = routed.points;
  }
  const routedPolyline = routingPoints
    ? buildOrthogonalPolyline(
      exactSource,
      exactTarget,
      sourcePosition,
      targetPosition,
      routingPoints.map(([x, y]) => ({ x, y })),
    )
    : authoredPolyline;
  const polyline = isPreviewing ? authoredPolyline : routedPolyline;

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const exactPath = polylineToPath(polyline);

  const startStretch = (event: React.PointerEvent<SVGLineElement>, segmentIndex: number) => {
    if (!selected || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    dragRef.current = { pointerId: event.pointerId, segmentIndex, start, polyline };
    previewRef.current = storedWaypoints;
    edgeData.onStretch(storedWaypoints, "start");
    let lastWaypoints = storedWaypoints;
    const move = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
      pointerEvent.preventDefault();
      const position = screenToFlowPosition({ x: pointerEvent.clientX, y: pointerEvent.clientY });
      const segment = drag.polyline[drag.segmentIndex + 1];
      const origin = drag.polyline[drag.segmentIndex];
      const horizontal = Math.abs(segment.x - origin.x) >= Math.abs(segment.y - origin.y);
      const delta = horizontal ? snap(position.y - drag.start.y) : snap(position.x - drag.start.x);
      const candidate = stretchSegment(drag.polyline, drag.segmentIndex, delta);
      const nextWaypoints = candidate.slice(1, -1);
      const candidatePolyline = buildOrthogonalPolyline(
        exactSource,
        exactTarget,
        sourcePosition,
        targetPosition,
        nextWaypoints,
      );
      if (wirePolylineBlocked(candidatePolyline, partNodes, source, target)) return;
      lastWaypoints = nextWaypoints;
      previewRef.current = nextWaypoints;
      setPreviewWaypoints(nextWaypoints);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;
    };
    const finish = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
      cleanup();
      dragRef.current = null;
      previewRef.current = null;
      setPreviewWaypoints(null);
      edgeData.onStretch(lastWaypoints, "stop");
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const nudgeSegment = (event: React.KeyboardEvent<SVGLineElement>, segmentIndex: number) => {
    const start = polyline[segmentIndex];
    const end = polyline[segmentIndex + 1];
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const key = event.key;
    const delta = horizontal
      ? key === "ArrowUp" ? -GRID : key === "ArrowDown" ? GRID : 0
      : key === "ArrowLeft" ? -GRID : key === "ArrowRight" ? GRID : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const candidate = stretchSegment(polyline, segmentIndex, delta);
    if (wirePolylineBlocked(candidate, partNodes, source, target)) return;
    const nextWaypoints = candidate.slice(1, -1);
    edgeData.onStretch(storedWaypoints, "start");
    edgeData.onStretch(nextWaypoints, "stop");
  };

  const baseEdge = (
    <BaseEdge
      id={id}
      path={exactPath}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
    />
  );

  return (
    <>
      {baseEdge}
      {selected ? polyline.slice(0, -1).map((start, segmentIndex) => {
        const end = polyline[segmentIndex + 1];
        const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (length < 12) return null;
        return (
          <g key={`${id}:segment:${segmentIndex}`} className="schematic-wire-segment-control">
            <line
              className="schematic-wire-segment-indicator"
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
            <line
              className="schematic-wire-segment-grip nodrag nopan"
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              tabIndex={0}
              role="slider"
              aria-label={`Move ${horizontal ? "horizontal wire segment vertically" : "vertical wire segment horizontally"}`}
              aria-orientation={horizontal ? "vertical" : "horizontal"}
              aria-valuemin={0}
              aria-valuemax={horizontal ? WORLD.height : WORLD.width}
              aria-valuenow={Math.round(horizontal ? (start.y + end.y) / 2 : (start.x + end.x) / 2)}
              style={{ cursor: horizontal ? "ns-resize" : "ew-resize" }}
              onPointerDown={(event) => startStretch(event, segmentIndex)}
              onKeyDown={(event) => nudgeSegment(event, segmentIndex)}
            />
          </g>
        );
      }) : null}
    </>
  );
}

function buildOrthogonalPolyline(
  source: XYPosition,
  target: XYPosition,
  sourcePosition: Position,
  targetPosition: Position,
  waypoints: XYPosition[],
) {
  if (!waypoints.length) return simplifyPolyline(nativeStepPolyline(source, target, sourcePosition, targetPosition));
  const anchors = [source, ...waypoints, target];
  const result: XYPosition[] = [anchors[0]];
  for (const next of anchors.slice(1)) {
    const previous = result[result.length - 1];
    if (Math.abs(previous.x - next.x) > COORD_EPSILON && Math.abs(previous.y - next.y) > COORD_EPSILON) {
      const before = result.at(-2);
      const priorWasHorizontal = before ? before.y === previous.y : sourcePosition === Position.Left || sourcePosition === Position.Right;
      result.push(priorWasHorizontal ? { x: next.x, y: previous.y } : { x: previous.x, y: next.y });
    }
    result.push(next);
  }
  return simplifyPolyline(result);
}

function nativeStepPolyline(source: XYPosition, target: XYPosition, sourcePosition: Position, targetPosition: Position) {
  if (Math.abs(source.x - target.x) <= COORD_EPSILON || Math.abs(source.y - target.y) <= COORD_EPSILON) return [source, target];
  const sourceHorizontal = sourcePosition === Position.Left || sourcePosition === Position.Right;
  const targetHorizontal = targetPosition === Position.Left || targetPosition === Position.Right;
  if (sourceHorizontal && targetHorizontal) {
    const middleX = snap((source.x + target.x) / 2);
    return [source, { x: middleX, y: source.y }, { x: middleX, y: target.y }, target];
  }
  if (!sourceHorizontal && !targetHorizontal) {
    const middleY = snap((source.y + target.y) / 2);
    return [source, { x: source.x, y: middleY }, { x: target.x, y: middleY }, target];
  }
  return [source, sourceHorizontal ? { x: target.x, y: source.y } : { x: source.x, y: target.y }, target];
}

function stretchSegment(polyline: XYPosition[], segmentIndex: number, delta: number) {
  const start = polyline[segmentIndex];
  const end = polyline[segmentIndex + 1];
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const movedStart = horizontal ? { x: start.x, y: snap(start.y + delta) } : { x: snap(start.x + delta), y: start.y };
  const movedEnd = horizontal ? { x: end.x, y: snap(end.y + delta) } : { x: snap(end.x + delta), y: end.y };
  const last = polyline.length - 1;
  const result: XYPosition[] = [];
  for (let index = 0; index < polyline.length; index += 1) {
    if (index === segmentIndex) {
      if (index === 0) result.push(polyline[index]);
      result.push(movedStart);
      continue;
    }
    if (index === segmentIndex + 1) {
      result.push(movedEnd);
      if (index === last) result.push(polyline[index]);
      continue;
    }
    result.push(polyline[index]);
  }
  return simplifyPolyline(result);
}

function simplifyPolyline(points: XYPosition[]) {
  const deduped = points.filter((point, index) => index === 0 || Math.abs(point.x - points[index - 1].x) > COORD_EPSILON || Math.abs(point.y - points[index - 1].y) > COORD_EPSILON);
  const simplified: XYPosition[] = [];
  for (const point of deduped) {
    while (simplified.length >= 2) {
      const before = simplified[simplified.length - 2];
      const previous = simplified[simplified.length - 1];
      const horizontal = Math.abs(before.y - previous.y) <= COORD_EPSILON && Math.abs(previous.y - point.y) <= COORD_EPSILON;
      const vertical = Math.abs(before.x - previous.x) <= COORD_EPSILON && Math.abs(previous.x - point.x) <= COORD_EPSILON;
      const forward = horizontal
        ? (previous.x - before.x) * (point.x - previous.x) >= 0
        : vertical && (previous.y - before.y) * (point.y - previous.y) >= 0;
      if (!forward) break;
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified;
}

function polylineToPath(points: XYPosition[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
}

function wirePolylineBlocked(points: XYPosition[], nodes: SchematicFlowNode[], sourceId: string, targetId: string) {
  return points.slice(0, -1).some((start, index) => {
    const excludeNodeIds = [
      ...(index === 0 ? [sourceId] : []),
      ...(index === points.length - 2 ? [targetId] : []),
    ];
    return isDirectPathBlocked(start, points[index + 1], nodes, { nodePadding: ROUTER_CLEARANCE, excludeNodeIds });
  });
}

function toRoutingObstacleNode(node: PartFlowNode): PartFlowNode {
  const part = node.data.part;
  const local = localSymbolObstacle(part.kind);
  const center = rotatePoint({ x: local.centerX, y: part.mirrorY ? -local.centerY : local.centerY }, part.rotation);
  const sideways = part.rotation === 90 || part.rotation === 270;
  const width = sideways ? local.height : local.width;
  const height = sideways ? local.width : local.height;
  return {
    ...node,
    position: {
      x: part.x + center.x - width / 2,
      y: part.y + center.y - height / 2,
    },
    width,
    height,
    measured: { width, height },
  };
}

function localSymbolObstacle(kind: SchematicPart["kind"]) {
  if (kind === "resistor" || kind === "potentiometer") return { width: 70, height: kind === "potentiometer" ? 54 : 30, centerX: 0, centerY: kind === "potentiometer" ? -9 : 0 };
  if (kind === "capacitor" || kind === "capacitor-polarized") return { width: 28, height: 58, centerX: 0, centerY: 0 };
  if (kind === "inductor") return { width: 76, height: 30, centerX: 0, centerY: -5 };
  if (kind === "transformer") return { width: 86, height: 76, centerX: 0, centerY: 0 };
  if (kind === "voltage" || kind === "current") return { width: 76, height: 76, centerX: 0, centerY: 0 };
  if (kind === "battery") return { width: 50, height: 58, centerX: 0, centerY: 0 };
  if (kind === "ground") return { width: 54, height: 58, centerX: 0, centerY: -20 };
  if (kind === "power") return { width: 44, height: 64, centerX: 0, centerY: 14 };
  if (kind === "opamp" || kind === "comparator") return { width: 74, height: 86, centerX: 3, centerY: 0 };
  if (kind === "npn" || kind === "pnp" || kind === "nmos" || kind === "pmos") return { width: 66, height: 100, centerX: 4, centerY: 0 };
  if (kind === "probe") return { width: 34, height: 34, centerX: -7, centerY: 0 };
  if (kind === "logic-not" || kind === "logic-and" || kind === "logic-or") return { width: 82, height: 78, centerX: 1, centerY: 0 };
  return { width: 60, height: 60, centerX: 0, centerY: 0 };
}

function SchematicPartNode({ data, selected }: NodeProps<PartFlowNode>) {
  const { part, connectedPins, tool } = data;
  const label = localLabelPosition(part.rotation);
  return (
    <div className={`schematic-flow-part ${selected ? "selected" : ""}`} data-kind={part.kind}>
      <svg viewBox={`${-PART_WIDTH / 2} ${-PART_HEIGHT / 2} ${PART_WIDTH} ${PART_HEIGHT}`} aria-hidden="true">
        {selected ? <rect className="schematic-flow-selection" x={-67} y={-58} width={134} height={116} rx={5} /> : null}
        <g transform={`rotate(${part.rotation}) scale(1 ${part.mirrorY ? -1 : 1})`}><SchematicSymbol kind={part.kind} showPinMarks={false} /></g>
        {part.kind !== "ground" && part.kind !== "probe" && part.kind !== "power" ? (
          <>
            <text className={`reference-label ${label.className}`} x={label.x} y={label.referenceY}>{part.id}</text>
            {part.value ? <text className={`value-label ${label.className}`} x={label.x} y={label.valueY}>{part.value}</text> : null}
          </>
        ) : null}
        {part.kind === "probe" ? <text className="probe-label" x={10} y={5}>{part.label || part.id}</text> : null}
        {part.kind === "power" ? <text className="power-label" x={0} y={-22} textAnchor="middle">{part.label || "VCC"}</text> : null}
      </svg>
      {symbolPins(part.kind).map((pin, index) => {
        const point = partPinPoint(pin, part);
        const degree = connectedPins[index] ?? 0;
        return (
          <Handle
            key={`${part.id}:pin:${index}`}
            id={`pin:${index}`}
            type="source"
            position={handlePosition(point)}
            className={`schematic-flow-handle nodrag ${degree ? "connected" : "open"} ${degree > 1 ? "branched" : ""}`}
            style={{
              left: PART_WIDTH / 2 + point.x,
              top: PART_HEIGHT / 2 + point.y,
            }}
            isConnectable={tool !== "pan"}
            aria-label={`${part.id} pin ${index + 1}, ${pin.name}. Click to start or finish a wire.`}
          >
            <span aria-hidden="true" />
          </Handle>
        );
      })}
    </div>
  );
}

function SchematicJunctionNode({ data }: NodeProps<JunctionFlowNode>) {
  return (
    <div className={`schematic-flow-junction ${data.degree >= 3 ? "branched" : "inline"}`}>
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((position) => (
        <Handle
          key={position}
          id={`junction:${position}`}
          type="source"
          position={position}
          className="schematic-flow-junction-handle nodrag"
          isConnectable={false}
          aria-hidden="true"
        />
      ))}
      {data.degree >= 3 ? <span className="schematic-flow-junction-dot" aria-hidden="true" /> : null}
      {data.label ? <span className="schematic-flow-net-label">{data.label}</span> : null}
    </div>
  );
}

function endpointToFlow(endpoint: Endpoint, opposite: Endpoint, document: CircuitDocument) {
  return endpoint.type === "pin"
    ? { nodeId: endpoint.partId, handleId: `pin:${endpoint.pin}` }
    : { nodeId: junctionNodeId(endpoint.junctionId), handleId: `junction:${junctionHandlePosition(endpoint, opposite, document)}` };
}

function flowToEndpoint(nodeId: string | null, handleId: string | null, document: CircuitDocument): Endpoint | null {
  if (!nodeId || !handleId) return null;
  if (nodeId.startsWith("junction:") && handleId.startsWith("junction:")) {
    const junctionId = nodeId.slice("junction:".length);
    return document.junctions.some((junction) => junction.id === junctionId) ? { type: "junction", junctionId } : null;
  }
  const match = /^pin:(\d+)$/.exec(handleId);
  if (!match) return null;
  const pin = Number(match[1]);
  const part = document.parts.find((candidate) => candidate.id === nodeId);
  return part && pin >= 0 && pin < symbolPins(part.kind).length ? { type: "pin", partId: nodeId, pin } : null;
}

function junctionHandlePosition(endpoint: Extract<Endpoint, { type: "junction" }>, opposite: Endpoint, document: CircuitDocument) {
  const here = endpointWorldPosition(endpoint, document);
  const there = endpointWorldPosition(opposite, document);
  if (!here || !there) return Position.Top;
  const dx = there.x - here.x;
  const dy = there.y - here.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? Position.Left : Position.Right;
  return dy < 0 ? Position.Top : Position.Bottom;
}

function endpointWorldPosition(endpoint: Endpoint, document: CircuitDocument): XYPosition | null {
  if (endpoint.type === "junction") {
    const junction = document.junctions.find((candidate) => candidate.id === endpoint.junctionId);
    return junction ? { x: junction.x, y: junction.y } : null;
  }
  const part = document.parts.find((candidate) => candidate.id === endpoint.partId);
  const pin = part ? symbolPins(part.kind)[endpoint.pin] : null;
  if (!part || !pin) return null;
  const point = partPinPoint(pin, part);
  return { x: part.x + point.x, y: part.y + point.y };
}

function junctionNodeId(junctionId: string) {
  return `junction:${junctionId}`;
}

function rotatePoint(point: XYPosition, rotation: number): XYPosition {
  if (rotation === 90) return { x: -point.y, y: point.x };
  if (rotation === 180) return { x: -point.x, y: -point.y };
  if (rotation === 270) return { x: point.y, y: -point.x };
  return point;
}

function partPinPoint(point: XYPosition, part: SchematicPart) {
  return rotatePoint({ x: point.x, y: part.mirrorY ? -point.y : point.y }, part.rotation);
}

function handlePosition(point: XYPosition) {
  if (Math.abs(point.x) >= Math.abs(point.y)) return point.x < 0 ? Position.Left : Position.Right;
  return point.y < 0 ? Position.Top : Position.Bottom;
}

function localLabelPosition(rotation: SchematicPart["rotation"]) {
  if (rotation === 90) return { x: 58, referenceY: -8, valueY: 15, className: "label-side-right" };
  if (rotation === 270) return { x: -58, referenceY: -8, valueY: 15, className: "label-side-left" };
  return { x: 0, referenceY: -43, valueY: 49, className: "label-horizontal" };
}

function isPlaceableTool(value: string): value is Exclude<Tool, "select" | "pan" | "wire"> {
  return value !== "select" && value !== "pan" && value !== "wire";
}

function sameEndpoint(a: Endpoint, b: Endpoint) {
  return a.type === b.type && (a.type === "pin" && b.type === "pin"
    ? a.partId === b.partId && a.pin === b.pin
    : a.type === "junction" && b.type === "junction" && a.junctionId === b.junctionId);
}

function sameConnection(wire: CircuitDocument["wires"][number], a: Endpoint, b: Endpoint) {
  return (sameEndpoint(wire.from, a) && sameEndpoint(wire.to, b)) || (sameEndpoint(wire.from, b) && sameEndpoint(wire.to, a));
}

function snap(value: number) {
  return Math.round(value / GRID) * GRID;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
