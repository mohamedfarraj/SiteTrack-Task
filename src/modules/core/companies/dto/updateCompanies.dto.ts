import { PartialType } from "@nestjs/swagger";
import { CreateCompanies } from "./createCompanies.dto";

export class UpdateCompanies extends PartialType(CreateCompanies) {}
