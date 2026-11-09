import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'noSpace' })
export class NoSpace implements ValidatorConstraintInterface {
    validate(value: string) {
        return !value.includes(' ');
    }

    defaultMessage(args: ValidationArguments) {
        return `${args.property} should not contain spaces`;
    }
} 