import { Scenes } from 'telegraf';

export async function buyCommand(ctx: Scenes.SceneContext) {
  // Enter the buy scene
  await ctx.scene.enter('buy');
}
