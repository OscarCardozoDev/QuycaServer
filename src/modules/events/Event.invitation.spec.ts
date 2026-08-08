import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventService } from './Event.service';

describe('EventService.sendInvitation', () => {
  let service: EventService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      events: { findUnique: jest.fn() },
      groups: { findUnique: jest.fn() },
      groupEvent: { findFirst: jest.fn() },
      eventInvitation: { upsert: jest.fn() },
    };
    service = new EventService(prismaMock, {} as any);
  });

  it('rechaza invitar un grupo de otra institución', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      uid: 'e1',
      status: 'APPROVED',
      institutionId: 'inst-a',
    });
    prismaMock.groups.findUnique.mockResolvedValue({
      uid: 'g1',
      institutionId: 'inst-b',
    });

    await expect(service.sendInvitation('e1', 'g1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza si el grupo no existe', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      uid: 'e1',
      status: 'APPROVED',
      institutionId: 'inst-a',
    });
    prismaMock.groups.findUnique.mockResolvedValue(null);

    await expect(service.sendInvitation('e1', 'g1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('acepta un grupo de la misma institución', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      uid: 'e1',
      status: 'APPROVED',
      institutionId: 'inst-a',
    });
    prismaMock.groups.findUnique.mockResolvedValue({
      uid: 'g1',
      institutionId: 'inst-a',
    });
    prismaMock.groupEvent.findFirst.mockResolvedValue(null);
    prismaMock.eventInvitation.upsert.mockResolvedValue({ uid: 'inv1' });

    await expect(service.sendInvitation('e1', 'g1')).resolves.toEqual({
      uid: 'inv1',
    });
  });
});
