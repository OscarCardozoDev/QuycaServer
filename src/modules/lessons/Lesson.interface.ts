export const MANAGE_ROLES = ['rector', 'coordinator'];

/** Estados en los que el autor todavía puede editar su propia lección. */
export const AUTHOR_EDITABLE_STATUSES = ['DRAFT', 'REJECTED'];

export interface CreateLessonUseCase {
  title: string;
  summary?: string;
  categoryId?: string;
  groupId?: string;
  authorId: string;
  institutionId: string;
}

export interface UpdateLessonUseCase {
  lessonId: string;
  userId: string;
  contextRole: string;
  data: {
    title?: string;
    summary?: string;
    categoryId?: string;
    coverPhotoId?: string;
  };
}

export interface ReviewLessonUseCase {
  lessonId: string;
  reviewerId: string;
  approve: boolean;
  feedback?: string;
}
