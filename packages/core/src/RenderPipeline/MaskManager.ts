import { SpriteMask, SpriteMaskInteraction, SpriteRenderer, TextRenderer } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { StencilOperation } from "../shader";
import { RenderElement } from "./RenderElement";

/**
 * @internal
 */
export class MaskManager {
  allSpriteMasks = new DisorderedArray<SpriteMask>();

  private _preMaskLayer = 0;

  constructor(public engine: Engine) {}

  addSpriteMask(mask: SpriteMask): void {
    this.allSpriteMasks.add(mask);
  }

  insertMask(elements: Array<RenderElement>, maskInsertedElements: Array<RenderElement>): void {
    const length = elements.length;
    if (length === 0) {
      return;
    }

    for (let i = 0; i < length; ++i) {
      const element = elements[i];
      const renderer = element.data.component;
      // @ts-ignore
      const maskInteraction = renderer.maskInteraction;
      if (maskInteraction && maskInteraction !== SpriteMaskInteraction.None) {
        this._processMasksDiff(<SpriteRenderer | TextRenderer>renderer, maskInsertedElements);
      }
      maskInsertedElements.push(element);
    }
  }

  clear(): void {
    this.allSpriteMasks.length = 0;
    this._preMaskLayer = 0;
  }

  destroy(): void {
    this.clear();
  }

  private _processMasksDiff(renderer: SpriteRenderer | TextRenderer, maskInsertedElements: Array<RenderElement>): void {
    const renderElementPool = this.engine._renderElementPool;
    const preMaskLayer = this._preMaskLayer;
    const curMaskLayer = renderer.maskLayer;
    if (preMaskLayer !== curMaskLayer) {
      const masks = this.allSpriteMasks;
      const commonLayer = preMaskLayer & curMaskLayer;
      const addLayer = curMaskLayer & ~preMaskLayer;
      const reduceLayer = preMaskLayer & ~curMaskLayer;

      const allSpriteMasks = masks._elements;
      for (let i = 0, n = masks.length; i < n; i++) {
        const mask = allSpriteMasks[i];
        const influenceLayers = mask.influenceLayers;

        if (influenceLayers & commonLayer) {
          continue;
        }

        if (influenceLayers & addLayer) {
          const renderElement = renderElementPool.get();
          this._cloneRenderElement(mask._renderElement, renderElement);
          renderElement.stencilOperation = StencilOperation.IncrementSaturate;
          maskInsertedElements.push(renderElement);
          continue;
        }

        if (influenceLayers & reduceLayer) {
          const renderElement = renderElementPool.get();
          this._cloneRenderElement(mask._renderElement, renderElement);
          renderElement.stencilOperation = StencilOperation.DecrementSaturate;
          maskInsertedElements.push(renderElement);
        }
      }
    }
    this._preMaskLayer = curMaskLayer;
  }

  private _cloneRenderElement(srcRenderElement: RenderElement, dstRenderElement: RenderElement): void {
    dstRenderElement.set(srcRenderElement.data, srcRenderElement.shaderPasses);
  }
}
