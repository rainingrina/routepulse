import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useLogin, useMe } from '../../api/hooks/auth';
import { isApiRequestError } from '../../api/client';
import { IS_MOCK_MODE } from '../../api/services';
import { Banner } from '../../components/display/feedback';
import { Skeleton } from '../../components/display/basics';
import { Button, IconButton } from '../../components/primitives/Button';
import { TextField } from '../../components/primitives/TextField';
import { CircleAlert, Eye, EyeOff } from '../../components/icons';
import { t } from '../../i18n/en';
import { HOME_PATH, SESSION_EXPIRED_PARAM, SESSION_EXPIRED_VALUE } from '../../app/access';
import { validateLogin, type LoginFieldErrors } from './loginValidation';

function loginErrorMessage(error: unknown): string {
  if (isApiRequestError(error)) {
    if (error.code === 'UNAUTHENTICATED') return t.login.incorrect;
    if (error.code === 'RATE_LIMITED') return t.login.rateLimited;
    if (error.kind === 'network' || (error.kind === 'http' && error.code === null)) return t.login.unreachable;
    return error.message;
  }
  return t.states.somethingWrong;
}

/** UI plan §5 — #1 login, #3 me (signed-in users go to their home). */
export default function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  if (me.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-11" />
      </div>
    );
  }
  if (me.data) return <Navigate to={HOME_PATH[me.data.role]} replace />;

  const sessionEnded = params.get(SESSION_EXPIRED_PARAM) === SESSION_EXPIRED_VALUE;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: (res) => void navigate(res.homePath, { replace: true }) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-text">{t.login.title}</h1>
        <p className="mt-1 text-body text-text-secondary">RoutePulse control tower for Plant X (fictional).</p>
      </div>
      {sessionEnded && !login.isError ? <Banner tone="info">{t.login.sessionEnded}</Banner> : null}
      {IS_MOCK_MODE ? (
        <Banner tone="accent">
          Mock mode: sign in as <span className="font-medium">coordinator@plantx.test</span>,{' '}
          <span className="font-medium">buyer@kestrel.test</span> or <span className="font-medium">driver.ramesh@ghatline.test</span> with any
          password. No real authentication happens.
        </Banner>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-xs">
        <TextField
          label={t.login.email}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={login.isPending}
          maxLength={254}
        />
        <TextField
          label={t.login.password}
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={login.isPending}
          maxLength={128}
          trailing={
            <IconButton
              icon={showPassword ? EyeOff : Eye}
              label={showPassword ? t.login.hide : t.login.show}
              size="sm"
              onClick={() => setShowPassword((s) => !s)}
            />
          }
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={login.isPending}>
          {t.login.submit}
        </Button>
        {login.isError ? (
          <p role="alert" className="flex items-start gap-1.5 text-body text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            {loginErrorMessage(login.error)}
          </p>
        ) : null}
      </form>
      <p className="text-small text-text-muted lg:hidden">{t.fictionalDemo}</p>
    </div>
  );
}
