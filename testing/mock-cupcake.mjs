export class Cupcake {
  isReady = true;

  async init(_path, _harness) {}

  async evaluate(event) {
    if (event.kind === 'user_bash' && String(event.args?.command ?? '').includes('cupcake-smoke-block')) {
      return {
        decision: 'Deny',
        reason: 'mock cupcake blocked cupcake-smoke-block',
      };
    }

    return {
      decision: 'Allow',
      reason: 'allowed by mock cupcake',
    };
  }
}
