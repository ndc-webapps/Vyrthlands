import * as THREE from 'three';
import { BLOCKS } from './blocks';
import { Atlas, Tile } from './textures';
import { ITEMS, itemIcon } from './items';

/**
 * First-person view model: arm + held block or item sprite attached to
 * the camera, with swing animation (mining/placing) and walk bob.
 */
export class ViewModel {
  private group = new THREE.Group();
  private swingGroup = new THREE.Group();
  private held: THREE.Mesh;
  private heldSprite: THREE.Mesh;       // flat pixel sprite for tools/items
  private swingT = 1; // 0..1 animating, >=1 idle
  private bobT = 0;
  swinging = false; // keep re-triggering while held (mining)
  private tileTextures = new Map<Tile, THREE.Texture>();
  private itemTextures = new Map<number, THREE.Texture>();

  constructor(camera: THREE.PerspectiveCamera, private atlas: Atlas) {
    camera.add(this.group);
    this.group.add(this.swingGroup);
    this.group.position.set(0.42, -0.42, -0.75);
    this.group.scale.setScalar(0.72);

    // arm: sleeve + skin hand, stylized
    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.13, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x3aa8e0 })
    );
    sleeve.position.set(0.06, -0.08, 0.28);
    sleeve.rotation.set(0.25, -0.3, 0);
    this.swingGroup.add(sleeve);

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.16),
      new THREE.MeshLambertMaterial({ color: 0xd8a07a })
    );
    hand.position.set(0.0, -0.015, 0.0);
    hand.rotation.set(0.25, -0.3, 0);
    this.swingGroup.add(hand);

    // held block (materials swapped on selection)
    this.held = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), []);
    this.held.position.set(-0.04, 0.1, -0.08);
    this.held.rotation.set(0.35, 0.7, 0.1);
    this.swingGroup.add(this.held);

    // held tool/item: flat pixel sprite, angled like a gripped tool
    this.heldSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.46),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
    );
    this.heldSprite.position.set(-0.06, 0.16, -0.06);
    this.heldSprite.rotation.set(0.15, -0.45, -0.5);
    this.heldSprite.visible = false;
    this.swingGroup.add(this.heldSprite);
  }

  private tileTexture(tile: Tile): THREE.Texture {
    let tex = this.tileTextures.get(tile);
    if (!tex) {
      tex = new THREE.CanvasTexture(this.atlas.icon(tile, 16));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.tileTextures.set(tile, tex);
    }
    return tex;
  }

  /** Show whatever is selected: block cube, item sprite, or empty hand. */
  setHeldItem(id: number): void {
    if (id > 0 && id < 100 && BLOCKS[id]) {
      this.heldSprite.visible = false;
      this.setHeldBlock(id);
      return;
    }
    this.held.visible = false;
    const def = ITEMS[id];
    if (!def?.icon) {
      this.heldSprite.visible = false;
      return;
    }
    let tex = this.itemTextures.get(id);
    if (!tex) {
      tex = new THREE.CanvasTexture(itemIcon(id, this.atlas, 32));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.itemTextures.set(id, tex);
    }
    const mat = this.heldSprite.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.heldSprite.visible = true;
  }

  setHeldBlock(id: number): void {
    const d = BLOCKS[id];
    this.held.visible = !!d;
    if (!d) return;
    const mk = (tile: Tile) => {
      const map = this.tileTexture(tile);
      return d.bucket === 'glow'
        ? new THREE.MeshBasicMaterial({ map })
        : new THREE.MeshLambertMaterial({ map, transparent: d.bucket !== 'opaque' });
    };
    const oldMats = this.held.material as THREE.Material[];
    if (Array.isArray(oldMats)) oldMats.forEach((m) => m.dispose());
    const side = mk(d.tiles.side), top = mk(d.tiles.top), bottom = mk(d.tiles.bottom);
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z
    this.held.material = [side, side, top, bottom, side, side];
  }

  triggerSwing(): void {
    if (this.swingT >= 1) this.swingT = 0;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  update(dt: number, horizontalSpeed: number, onGround: boolean): void {
    // walk bob
    if (horizontalSpeed > 0.5 && onGround) {
      this.bobT += dt * horizontalSpeed * 1.8;
    }
    const bobY = Math.sin(this.bobT * 2) * 0.012;
    const bobX = Math.cos(this.bobT) * 0.008;
    this.group.position.set(0.42 + bobX, -0.42 + bobY, -0.75);

    // swing
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.28);
    } else if (this.swinging) {
      this.swingT = 0; // continuous mining swings
    }
    const s = this.swingT < 1 ? Math.sin(this.swingT * Math.PI) : 0;
    this.swingGroup.rotation.set(-s * 1.1, -s * 0.35, 0);
    this.swingGroup.position.z = -s * 0.18;
  }
}
