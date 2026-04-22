import { HttpStatus } from '@nestjs/common'

import { AppExceptionProps } from './app.exception'

export const errorDictionary = {
  standard: {
    message:
      'Algo de errado aconteceu ao processar sua requisição. Tente novamente mais tarde.',
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'STANDARD_ERROR',
  } as const,

  user: {
    notFound: {
      message: 'Usuário não encontrado.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'USER_NOT_FOUND',
    } as const,

    emailExists: (email: string): AppExceptionProps => ({
      message: 'Um usuário com este email já existe.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'USER_EMAIL_EXISTS',
      info: email,
    }),

    invalidCredentials: {
      message: 'Credenciais fornecidas são inválidas.',
      statusCode: HttpStatus.UNAUTHORIZED,
      errorCode: 'USER_INVALID_CREDENTIALS',
    } as const,

    userNotProxy: {
      message: 'O usuário não possui permissão de proxy.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'USER_NOT_PROXY',
    } as const,

    merchantAccountCreationFailed: {
      message: 'Falha ao criar a conta do comerciante.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'MERCHANT_ACCOUNT_CREATION_FAILED',
    } as const,

    merchantAccountNotFound: {
      message:
        'Conta de comerciante não encontrada. Crie uma conta antes de acessar o painel.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'MERCHANT_ACCOUNT_NOT_FOUND',
    } as const,

    merchantDashboardLinkFailed: {
      message: 'Falha ao gerar o link do painel do comerciante.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'MERCHANT_DASHBOARD_LINK_FAILED',
    } as const,
  },

  card: {
    creationFailed: {
      message: 'Falha ao criar o método de pagamento.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'CARD_CREATION_FAILED',
    } as const,

    noSavedCardFound: {
      message: 'Nenhum cartão salvo encontrado para este usuário.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'NO_SAVED_CARD_FOUND',
    } as const,
  },

  tasks: {
    taskNotFound: {
      message: 'Tarefa não encontrada.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'TASK_NOT_FOUND',
    } as const,

    cannotStartOwnTask: {
      message: 'Você não pode iniciar uma tarefa que você mesmo criou.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'CANNOT_START_OWN_TASK',
    } as const,

    taskNotAvailable: {
      message: 'A tarefa não está disponível para ser iniciada.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'TASK_NOT_AVAILABLE',
    } as const,

    taskMappingNotFound: {
      message: 'Mapeamento da tarefa não encontrado.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'TASK_MAPPING_NOT_FOUND',
    } as const,

    cannotFinishTask: {
      message: 'Você não tem permissão para finalizar esta tarefa.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'CANNOT_FINISH_TASK',
    } as const,

    taskStartedAtNotValid: {
      message:
        'A tarefa não pode ser finalizada após mais de 1 hora do seu início.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'TASK_STARTED_AT_NOT_VALID',
    } as const,

    taskNotAvailableForValidation: {
      message: 'A tarefa não está em estado de validação.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'TASK_NOT_AVAILABLE_FOR_VALIDATION',
    } as const,

    cannotValidateTask: {
      message: 'Você não tem permissão para validar esta tarefa.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'CANNOT_VALIDATE_TASK',
    } as const,

    cannotCancelTask: {
      message: 'Você não tem permissão para cancelar esta tarefa.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'CANNOT_CANCEL_TASK',
    } as const,
  },

  payment: {
    paymentFailed: {
      message: 'Falha ao processar o pagamento.',
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      errorCode: 'PAYMENT_FAILED',
    } as const,

    transferFailed: {
      message: 'Falha ao criar transferência.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'TRANSFER_FAILED',
    } as const,

    refundFailed: {
      message: 'Falha ao processar o reembolso.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'REFUND_FAILED',
    } as const,
  },

  passwordReset: {
    tooManyRequests: {
      message:
        'Muitas tentativas de recuperação de senha. Aguarde alguns minutos antes de tentar novamente.',
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      errorCode: 'PASSWORD_RESET_TOO_MANY_REQUESTS',
    } as const,

    invalidOrExpiredCode: {
      message: 'Código de recuperação inválido ou expirado.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    } as const,

    sendFailed: {
      message: 'Falha ao enviar o código de recuperação. Tente novamente.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'PASSWORD_RESET_SEND_FAILED',
    } as const,
  },

  webhook: {
    invalidSignature: {
      message: 'Assinatura do webhook inválida.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'WEBHOOK_INVALID_SIGNATURE',
    } as const,

    missingRawBody: {
      message: 'Corpo da requisição do webhook ausente.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'WEBHOOK_MISSING_RAW_BODY',
    } as const,
  },

  file: {
    formatNotSupported: {
      message:
        'Formato de arquivo não suportado. Envie uma imagem JPG, PNG ou WEBP.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
    } as const,

    uploadFailed: {
      message: 'Falha ao fazer upload do arquivo.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'FILE_UPLOAD_FAILED',
    } as const,
  },
} as const
