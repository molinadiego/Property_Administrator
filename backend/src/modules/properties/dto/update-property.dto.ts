import { PartialType } from '@nestjs/swagger';
import { CreatePropertyDto } from './create-property.dto';

/** Only the administradora may edit official property data (spec §4.4). */
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
