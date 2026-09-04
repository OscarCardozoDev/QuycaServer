import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  Matches,
} from 'class-validator';
import { HORA_HHMM, HORA_HHMM_MSG } from 'src/common/validation';

export class ScheduleParamsDto {
  @ApiProperty({ example: 'uuid-del-horario' })
  @IsString()
  uid: string;
}

export class GroupParamDto {
  @ApiProperty({ example: 'uuid-del-grupo' })
  @IsString()
  groupId: string;
}

export class CreateScheduleDto {
  @ApiProperty({ example: 'uuid-del-grupo' })
  @IsString()
  groupId: string;

  @ApiProperty({
    example: 2,
    description: '0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(HORA_HHMM, { message: HORA_HHMM_MSG })
  startTime: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  @Matches(HORA_HHMM, { message: HORA_HHMM_MSG })
  endTime: string;
}

export class UpdateScheduleDto {
  @ApiProperty({ example: 3, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiProperty({ example: '15:00', required: false })
  @IsOptional()
  @IsString()
  @Matches(HORA_HHMM, { message: HORA_HHMM_MSG })
  startTime?: string;

  @ApiProperty({ example: '17:00', required: false })
  @IsOptional()
  @IsString()
  @Matches(HORA_HHMM, { message: HORA_HHMM_MSG })
  endTime?: string;
}
