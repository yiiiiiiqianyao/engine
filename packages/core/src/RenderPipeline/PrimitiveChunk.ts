import { Engine } from "../Engine";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexBufferBinding,
  IndexFormat,
  MeshTopology,
  Primitive,
  SetDataOptions,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "../graphic";
import { IPoolElement } from "../utils/ObjectPool";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

/**
 * @internal
 */
export class PrimitiveChunk {
  primitive: Primitive;
  vertices: Float32Array;
  indices: Uint16Array;

  updateVertexStart = Number.MAX_SAFE_INTEGER;
  updateVertexLength = Number.MIN_SAFE_INTEGER;
  updateIndexLength = 0;

  vertexFreeAreas: Array<Area>;
  // areaPool = new ReturnableObjectPool(Area, 10);
  // subChunkPool = new ReturnableObjectPool(SubPrimitiveChunk, 10);
  // subMeshPool = new ReturnableObjectPool(SubMesh, 10);

  constructor(engine: Engine, maxVertexCount: number) {
    const primitive = new Primitive(engine);

    // Vertex elements
    primitive.addVertexElement(new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0));
    primitive.addVertexElement(new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0));
    primitive.addVertexElement(new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0));
    primitive._addReferCount(1);

    // Vertices
    const vertexStride = 36;
    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      maxVertexCount * vertexStride,
      BufferUsage.Dynamic,
      true
    );
    primitive.setVertexBufferBinding(0, new VertexBufferBinding(vertexBuffer, vertexStride));

    // Indices
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, maxVertexCount * 8, BufferUsage.Dynamic, true);
    primitive.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, IndexFormat.UInt16));

    this.primitive = primitive;
    this.vertices = new Float32Array(vertexBuffer.data.buffer);
    this.indices = new Uint16Array(indexBuffer.data.buffer);
    this.vertexFreeAreas = [new Area(0, maxVertexCount * 9)];
  }

  allocateSubChunk(manager: PrimitiveChunkManager, vertexCount: number): SubPrimitiveChunk | null {
    const area = this._allocateArea(manager, vertexCount * 9);
    if (area) {
      const subChunk = manager.subChunkPool.get();
      subChunk.chunk = this;
      subChunk.vertexArea = area;

      const subMesh = manager.subMeshPool.get();
      subMesh.topology = MeshTopology.Triangles;
      subChunk.subMesh = subMesh;
      return subChunk;
    }

    return null;
  }

  freeSubChunk(manager: PrimitiveChunkManager, subChunk: SubPrimitiveChunk): void {
    this._freeArea(manager, subChunk.vertexArea);
    manager.subMeshPool.return(subChunk.subMesh);
    manager.subChunkPool.return(subChunk);
  }

  uploadBuffer(): void {
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    const { primitive, updateVertexStart, updateVertexLength } = this;
    if (updateVertexStart !== Number.MAX_SAFE_INTEGER && updateVertexLength !== Number.MIN_SAFE_INTEGER) {
      primitive.vertexBufferBindings[0].buffer.setData(
        this.vertices,
        updateVertexStart * 4,
        updateVertexStart,
        updateVertexLength,
        SetDataOptions.Discard
      );

      this.updateVertexStart = Number.MAX_SAFE_INTEGER;
      this.updateVertexLength = Number.MIN_SAFE_INTEGER;
    }

    primitive.indexBufferBinding.buffer.setData(this.indices, 0, 0, this.updateIndexLength, SetDataOptions.Discard);
    this.updateIndexLength = 0;
  }

  destroy(): void {
    this.primitive._addReferCount(-1);
    this.primitive.destroy();
    this.primitive = null;
    this.vertices = null;
    this.indices = null;
  }

  private _allocateArea(manager: PrimitiveChunkManager, needSize: number): Area | null {
    const areas = this.vertexFreeAreas;
    const pool = manager.areaPool;
    for (let i = 0, n = areas.length; i < n; ++i) {
      const area = areas[i];
      const size = area.size;
      if (size > needSize) {
        const newArea = pool.get();
        newArea.start = area.start;
        newArea.size = needSize;
        area.start += needSize;
        area.size -= needSize;
        return newArea;
      } else if (size === needSize) {
        areas.splice(i, 1);
        pool.return(area);
        return area;
      }
    }
    return null;
  }

  private _freeArea(manager: PrimitiveChunkManager, area: Area): void {
    const areas = this.vertexFreeAreas;
    const areaLen = areas.length;
    if (areaLen === 0) {
      areas.push(area);
      return;
    }

    const { areaPool: pool } = manager;
    let preArea = area;
    let notMerge = true;
    for (let i = 0; i < areaLen; ++i) {
      const curArea = areas[i];
      const { start: preStart, size } = preArea;
      const { start: curStart } = curArea;
      const preEnd = preStart + size;
      const curEnd = curStart + curArea.size;
      if (preEnd < curStart) {
        notMerge && areas.splice(i, 0, preArea);
        return;
      } else if (preEnd === curStart) {
        curArea.start = preStart;
        curArea.size += size;
        pool.return(preArea);
        preArea = curArea;
        notMerge = false;
      } else if (preStart === curEnd) {
        curArea.size += size;
        pool.return(preArea);
        preArea = curArea;
        notMerge = false;
      } else if (preStart > curEnd) {
        i + 1 === areaLen && areas.push(preArea);
      }
    }
  }
}

/**
 * @internal
 */
export class Area implements IPoolElement {
  constructor(
    public start?: number,
    public size?: number
  ) {}

  dispose?(): void {}
}
