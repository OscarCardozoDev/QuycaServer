import { ForbiddenException } from '@nestjs/common';
import { GroupController } from './Group.controller';

describe('GroupController.addStudent', () => {
  let controller: GroupController;
  let groupService: { addStudentToGroups: jest.Mock };

  beforeEach(() => {
    groupService = { addStudentToGroups: jest.fn().mockResolvedValue({ created: 1 }) };
    controller = new GroupController(groupService as any);
  });

  it('un miembro sin rol puede sumarse a sí mismo', async () => {
    const uid = 'u1';
    const body = { groupIds: ['g1'] };
    const institution = { uid: 'inst-1' } as any;
    const req = { contextRole: 'student' } as any;

    await controller.addStudent(uid, body, institution, req);

    expect(groupService.addStudentToGroups).toHaveBeenCalledWith({
      userId: 'u1',
      groupIds: ['g1'],
      institutionId: 'inst-1',
    });
  });

  it('un estudiante no puede agregar a otra persona', async () => {
    const uid = 'u1';
    const body = { userId: 'u2', groupIds: ['g1'] };
    const institution = { uid: 'inst-1' } as any;
    const req = { contextRole: 'student' } as any;

    await expect(controller.addStudent(uid, body, institution, req)).rejects.toThrow(ForbiddenException);
    expect(groupService.addStudentToGroups).not.toHaveBeenCalled();
  });

  it('un rector sí puede agregar a otra persona', async () => {
    const uid = 'u1';
    const body = { userId: 'u2', groupIds: ['g1'] };
    const institution = { uid: 'inst-1' } as any;
    const req = { contextRole: 'rector' } as any;

    await controller.addStudent(uid, body, institution, req);

    expect(groupService.addStudentToGroups).toHaveBeenCalledWith({
      userId: 'u2',
      groupIds: ['g1'],
      institutionId: 'inst-1',
    });
  });
});
