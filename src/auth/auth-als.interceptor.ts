import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { getAuthUser, runWithAuthUser } from '../common/request-context';

@Injectable()
export class AuthAlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = getAuthUser(context.switchToHttp().getRequest());
    if (!user) {
      return next.handle();
    }
    return new Observable((subscriber) => {
      return runWithAuthUser(user, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        }),
      );
    });
  }
}
