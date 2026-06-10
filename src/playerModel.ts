import * as THREE from 'three';

/** Simple stylized player body shown in third-person view. */
export class PlayerModel {
  private group = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private walkT = 0;

  constructor(scene: THREE.Scene) {
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a07a });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x3aa8e0 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2b3550 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skin);
    head.position.y = 1.56;
    this.group.add(head);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.28), shirt);
    torso.position.y = 1.0;
    this.group.add(torso);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), shirt);
    this.armL.position.set(-0.36, 1.0, 0);
    this.group.add(this.armL);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.36;
    this.group.add(this.armR);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), pants);
    this.legL.position.set(-0.13, 0.34, 0);
    this.group.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.13;
    this.group.add(this.legR);

    this.group.visible = false;
    scene.add(this.group);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  update(dt: number, position: THREE.Vector3, yaw: number, horizontalSpeed: number): void {
    this.group.position.copy(position);
    this.group.rotation.y = yaw + Math.PI; // model faces look direction
    if (horizontalSpeed > 0.5) this.walkT += dt * horizontalSpeed * 1.6;
    const sw = Math.sin(this.walkT * 2) * Math.min(1, horizontalSpeed / 5) * 0.55;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.8;
    this.armR.rotation.x = sw * 0.8;
  }
}
