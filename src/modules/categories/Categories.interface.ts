export interface CreateCategoryUseCase {
  name: string;
  slug: string;
  iconSlug: string;
}

export interface CreateContentRequestUseCase {
  institutionId: string;
  type: 'CATEGORY' | 'STYLE';
  requestedName: string;
  categoryId?: string;
  justification?: string;
}

export interface ReviewContentRequestUseCase {
  requestId: string;
  reviewedBy: string;
  approved: boolean;
  reviewNote?: string;
}
