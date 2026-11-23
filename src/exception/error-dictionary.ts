import { HttpStatus } from '@nestjs/common'

import { AppExceptionProps } from './app.exception'

export const errorDictionary = {
  standard: {
    message:
      'Algo de errado aconteceu ao processar sua requisição. Tente novamente mais tarde.',
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'STANDARD_ERROR',
  } as const,

  session: {
    refreshInvalid: {
      message: 'Sua sessão expirou. Entre novamente.',
      statusCode: HttpStatus.UNAUTHORIZED,
      errorCode: 'SESSION_REFRESH_INVALID',
    } as const,
  },

  user: {
    notClient: {
      message: 'Apenas clientes podem criar tarefas.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'USER_NOT_CLIENT',
    } as const,

    signUpUnavailable: {
      message:
        'Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos.',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      errorCode: 'SIGN_UP_UNAVAILABLE',
    } as const,

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

    accountNotReadyToStart: {
      message:
        'Conclua a configuração da sua conta na Carteira para aceitar tarefas.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'PROXY_ACCOUNT_NOT_READY',
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

    cannotDeleteWithActiveTasks: {
      message:
        'Você possui tarefas em andamento. Finalize ou cancele todas antes de excluir a conta.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'USER_HAS_ACTIVE_TASKS',
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

    cardNotFound: {
      message: 'Cartão não encontrado.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'CARD_NOT_FOUND',
    } as const,

    notConfirmed: {
      message: 'Cartão não confirmado. Adicione o cartão novamente.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'CARD_NOT_CONFIRMED',
    } as const,

    alreadyExists: {
      message:
        'Já existe um cartão salvo. Atualize a tela e tente novamente.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'CARD_ALREADY_EXISTS',
    } as const,

    cannotDeleteCard: {
      message: 'Você não tem permissão para remover este cartão.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'CANNOT_DELETE_CARD',
    } as const,
  },

  tasks: {
    cityNotServed: {
      message:
        'Ainda não atendemos nessa cidade. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'CITY_NOT_SERVED',
    } as const,

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

    proofPhotoRequired: {
      message: 'Envie uma foto de comprovação para finalizar a tarefa.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'PROOF_PHOTO_REQUIRED',
    } as const,

    statusConflict: {
      message: 'A tarefa mudou de estado. Atualize a tela e tente novamente.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'TASK_STATUS_CONFLICT',
    } as const,

    cannotFinishTask: {
      message: 'Você não tem permissão para finalizar esta tarefa.',
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'CANNOT_FINISH_TASK',
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

    proxyAccountNotReady: {
      message:
        'Não foi possível liberar o pagamento. O Proxy ainda não terminou de configurar a conta para receber.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'PROXY_ACCOUNT_NOT_READY',
    } as const,

    transferFailed: {
      message: 'Falha ao transferir o valor da tarefa para o proxy.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'TASK_TRANSFER_FAILED',
    } as const,
  },

  payment: {
    paymentFailed: {
      message: 'Não foi possível cobrar o cliente. Tente outra tarefa.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'PAYMENT_FAILED',
    } as const,

    chargePending: {
      message:
        'Ainda estamos confirmando a cobrança do cliente. Tente novamente em instantes.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'PAYMENT_PENDING',
    } as const,

    notConfirmed: {
      message:
        'O pagamento desta tarefa ainda não foi confirmado. Tente novamente em alguns minutos.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'PAYMENT_NOT_CONFIRMED',
    } as const,

    disputed: {
      message: 'O pagamento desta tarefa está em disputa. Fale com o suporte.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'PAYMENT_DISPUTED',
    } as const,

    refundFailed: {
      message: 'Falha ao processar o reembolso.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'REFUND_FAILED',
    } as const,
  },

  passwordReset: {
    invalidOrExpiredCode: {
      message: 'Código de recuperação inválido ou expirado.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
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
        'Formato de arquivo não suportado. Envie uma imagem JPG, PNG, WEBP ou HEIC.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
    } as const,

    uploadFailed: {
      message: 'Falha ao fazer upload do arquivo.',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'FILE_UPLOAD_FAILED',
    } as const,

    tooLarge: {
      message: 'Arquivo muito grande. O limite é 10 MB.',
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      errorCode: 'FILE_TOO_LARGE',
    } as const,
  },

  validation: {
    failed: {
      message: 'Dados inválidos. Verifique os campos e tente novamente.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'VALIDATION_FAILED',
    } as const,
  },

  http: {
    unauthorized: {
      message: 'Sessão inválida ou expirada. Entre novamente.',
      statusCode: HttpStatus.UNAUTHORIZED,
      errorCode: 'UNAUTHORIZED',
    } as const,

    tooManyRequests: {
      message: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      errorCode: 'TOO_MANY_REQUESTS',
    } as const,

    routeNotFound: {
      message: 'Rota não encontrada.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'ROUTE_NOT_FOUND',
    } as const,
  },

  database: {
    conflict: {
      message: 'Já existe um registro com esses dados.',
      statusCode: HttpStatus.CONFLICT,
      errorCode: 'RESOURCE_ALREADY_EXISTS',
    } as const,

    notFound: {
      message: 'Registro não encontrado.',
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: 'RESOURCE_NOT_FOUND',
    } as const,

    invalidId: {
      message: 'Identificador inválido.',
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: 'INVALID_IDENTIFIER',
    } as const,
  },

  health: {
    databaseUnavailable: {
      message: 'Banco de dados indisponível.',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      errorCode: 'HEALTH_DATABASE_UNAVAILABLE',
    } as const,
  },
} as const
