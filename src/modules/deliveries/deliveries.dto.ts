import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToArray } from '../../common/dto/boolean.transform';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DeliveryDirection, DeliveryStatus } from '../../common/enums';

export class StockLineDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId: number;

  @ApiProperty({ example: 25, description: 'Positive, up to 3 decimals' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(99_999_999_999)
  quantity: number;
}

/** One or more material lines (used by deliveries and stock additions). */
export class StockLinesDto {
  @ApiProperty({ type: [StockLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  lines: StockLineDto[];

  @ApiPropertyOptional({ example: 'Supplier invoice #4411' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}

/** Company store -> project store. */
export class CreateCompanyDeliveryDto extends StockLinesDto {
  @ApiProperty({ example: 'PRJ-0042' })
  @IsString()
  @IsNotEmpty()
  projectCode: string;
}

export class DeliveryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DeliveryDirection })
  @IsEnum(DeliveryDirection)
  @IsOptional()
  direction?: DeliveryDirection;

  @ApiPropertyOptional({ enum: DeliveryStatus, isArray: true, description: 'One or more (comma separated)' })
  @ToArray()
  @IsEnum(DeliveryStatus, { each: true })
  @IsOptional()
  status?: DeliveryStatus[];

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Sent on or after this date' })
  @IsDateString({ strict: true })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Sent on or before this date' })
  @IsDateString({ strict: true })
  @IsOptional()
  to?: string;
}

export class CompanyDeliveryListQueryDto extends DeliveryListQueryDto {
  @ApiPropertyOptional({ example: 'PRJ-0042', description: 'Only deliveries of this project' })
  @IsString()
  @IsOptional()
  projectCode?: string;
}
