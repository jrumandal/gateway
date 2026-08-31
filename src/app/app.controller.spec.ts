import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(() => {
    controller = new AppController();
  });

  describe('root', () => {
    it('should return the gateway info', () => {
      expect(controller.root()).toEqual({
        service: 'api-gateway',
        status: 'ok',
        graphql: '/graphql',
        health: '/health',
      });
    });
  });
});
