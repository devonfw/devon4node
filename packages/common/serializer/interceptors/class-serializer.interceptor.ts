/*
 * Nest @common
 * Copyright(c) 2017 - 2019 Kamil Mysliwiec
 * https://nestjs.com
 * MIT Licensed
 */
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Inject,
  Injectable,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { ClassTransformOptions } from '@nestjs/common/interfaces/external/class-transform-options.interface';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { CLASS_SERIALIZER_OPTIONS } from '@nestjs/common/serializer/class-serializer.constants';
import { CRUD_TYPE_ID } from '../defaults';

type ClassType<T> = {
  new (...args: any[]): T;
};

let classTransformer: any = {};

export interface PlainLiteralObject {
  [key: string]: any;
}

// NOTE (external)
// We need to deduplicate them here due to the circular dependency
// between core and common packages
const REFLECTOR = 'Reflector';

@Injectable()
export class ClassSerializerInterceptor implements NestInterceptor {
  constructor(@Inject(REFLECTOR) protected readonly reflector: any) {
    classTransformer = loadPackage(
      'class-transformer',
      'ClassSerializerInterceptor',
      () => require('class-transformer'),
    );
    require('class-transformer');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.getContextOptions(context);
    const type = this.getType(context);
    return next
      .handle()
      .pipe(
        map((res: PlainLiteralObject | PlainLiteralObject[]) =>
          this.serialize(res, options, type),
        ),
      );
  }

  serialize(
    response: PlainLiteralObject | PlainLiteralObject[],
    options?: ClassTransformOptions,
    type?: ClassType<any>,
  ): PlainLiteralObject | PlainLiteralObject[] {
    if (type) {
      if ((response as PlainLiteralObject).data) {
        const data: any = this.transformToClass(
          type,
          (response as PlainLiteralObject).data,
          options,
        );
        (response as PlainLiteralObject).data = this.transformToPlain(
          data,
          options,
        );

        return response;
      }
      return classTransformer.classToPlain(
        this.transformToClass(type, response, options),
        options,
      );
    } else {
      const isArray = Array.isArray(response);
      if (!isObject(response) && !isArray) {
        return response;
      }
      return isArray
        ? (response as PlainLiteralObject[]).map(item =>
            this.transformToPlain(item, options),
          )
        : this.transformToPlain(response, options);
    }
  }

  transformToPlain(
    plainOrClass: any,
    options?: ClassTransformOptions,
  ): PlainLiteralObject {
    return plainOrClass && plainOrClass.constructor !== Object
      ? classTransformer.classToPlain(plainOrClass, options)
      : plainOrClass;
  }

  transformToClass(
    classType: ClassType<any>,
    plainOrClass: any,
    options?: ClassTransformOptions,
  ) {
    return classTransformer.plainToClass(classType, plainOrClass, options);
  }

  private getContextOptions(
    context: ExecutionContext,
  ): ClassTransformOptions | undefined {
    return (
      this.reflectSerializeMetadata(context.getHandler()) ||
      this.reflectSerializeMetadata(context.getClass())
    );
  }

  private getType(context: ExecutionContext): ClassType<any> {
    return (
      this.reflector.get(CRUD_TYPE_ID, context.getHandler()) ||
      this.reflector.get(CRUD_TYPE_ID, context.getClass())
    );
  }

  private reflectSerializeMetadata(
    // tslint:disable-next-line: ban-types
    obj: object | Function,
  ): ClassTransformOptions | undefined {
    return this.reflector.get(CLASS_SERIALIZER_OPTIONS, obj);
  }
}
