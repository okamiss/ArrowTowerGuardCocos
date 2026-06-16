/**
 * GameSceneController.ts
 * ----------------------------------------------------------------------------
 * Scene bootstrap. This component is the one already wired into `scene.scene`
 * (on the centered `GameRoot` node under Canvas), so it is the entry point that
 * actually runs on Play. Its only job now is to launch the battle by attaching
 * BattleManager to the same node — which is centered under the 1280x720 Canvas,
 * exactly the setup BattleManager expects for correct tap-to-world conversion.
 *
 * It also normalizes GameRoot's UITransform to the full visible size. Input is
 * handled via the GLOBAL `input` system (clicks anywhere fire), so node size is
 * not strictly required for that — but sizing the node to the screen keeps the
 * editor inspector honest and avoids surprises for any node-local logic.
 *
 * (It previously drew a placeholder HUD/buttons with Graphics rectangles; that
 * "first screen, no combat" mock is superseded by the real battle demo. Restore
 * from git history if a separate pre-battle menu is needed later.)
 * ----------------------------------------------------------------------------
 */

import { _decorator, Component, UITransform, view } from 'cc';
import { BattleManager } from '../battle/BattleManager';

const { ccclass } = _decorator;

@ccclass('GameSceneController')
export class GameSceneController extends Component {
  protected start(): void {
    // Size GameRoot to the visible area (was a default 100x100 in the scene).
    const size = view.getVisibleSize();
    const ut = this.getComponent(UITransform) ?? this.addComponent(UITransform);
    ut.setContentSize(size.width, size.height);
    ut.setAnchorPoint(0.5, 0.5);

    // Idempotent: never stack two BattleManagers on the node.
    if (!this.getComponent(BattleManager)) {
      this.node.addComponent(BattleManager);
    }
  }
}
