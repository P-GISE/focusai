import {
  SlashCommandBuilder,
  type APIApplicationCommandOptionChoice,
} from 'discord.js'

export const commandNames = {
  status: '포커스상태',
  summary: '포커스요약',
  tickets: '문의목록',
  ticketDetail: '문의상세',
  ticketUpdate: '문의처리',
  announcementCreate: '공지등록',
  announcementList: '공지목록',
  announcementUpdate: '공지수정',
  announcementEnd: '공지종료',
  userSearch: '사용자조회',
  recentSessions: '최근세션',
  auditLogs: '감사로그',
  notificationChannelSet: '알림채널설정',
  notificationChannelList: '알림채널목록',
} as const

export const optionNames = {
  ticketId: '문의id',
  announcementId: '공지id',
  status: '상태',
  reply: '답변',
  email: '이메일',
  name: '이름',
  count: '개수',
  notificationKind: '종류',
  mentionRole: '멘션역할',
  title: '제목',
  body: '내용',
  tone: '공지유형',
  pinned: '고정',
  active: '활성',
} as const

const ticketStatusChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: '열림', value: 'open' },
  { name: '검토중', value: 'reviewing' },
  { name: '해결됨', value: 'resolved' },
  { name: '닫힘', value: 'closed' },
]

const toneChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: '정보', value: 'info' },
  { name: '좋음', value: 'good' },
  { name: '주의', value: 'warn' },
  { name: '위험', value: 'danger' },
]

const notificationKindChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: '문의', value: 'support' },
  { name: '상태', value: 'health' },
  { name: '일일요약', value: 'daily' },
]

export const commands = [
  new SlashCommandBuilder()
    .setName(commandNames.status)
    .setDescription('FocusAI 서비스 상태를 확인합니다.'),
  new SlashCommandBuilder()
    .setName(commandNames.summary)
    .setDescription('FocusAI 관리자 운영 요약을 확인합니다.'),
  new SlashCommandBuilder()
    .setName(commandNames.tickets)
    .setDescription('최근 문의 목록을 확인합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.status)
        .setDescription('문의 상태로 필터링합니다.')
        .setRequired(false)
        .addChoices(...ticketStatusChoices),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.ticketDetail)
    .setDescription('문의 상세 내용을 확인합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.ticketId)
        .setDescription('문의 ID입니다.')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.ticketUpdate)
    .setDescription('문의 상태와 관리자 답변을 수정합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.ticketId)
        .setDescription('문의 ID입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.status)
        .setDescription('새 문의 상태입니다.')
        .setRequired(true)
        .addChoices(...ticketStatusChoices),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.reply)
        .setDescription('문의에 저장할 관리자 답변입니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.userSearch)
    .setDescription('사용자를 이름이나 이메일로 조회합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.email)
        .setDescription('조회할 사용자 이메일입니다.')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.name)
        .setDescription('조회할 사용자 이름입니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.recentSessions)
    .setDescription('최근 학습 세션을 확인합니다.')
    .addIntegerOption((option) =>
      option
        .setName(optionNames.count)
        .setDescription('조회할 세션 개수입니다.')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.auditLogs)
    .setDescription('최근 관리자 감사 로그를 확인합니다.')
    .addIntegerOption((option) =>
      option
        .setName(optionNames.count)
        .setDescription('조회할 로그 개수입니다.')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.notificationChannelSet)
    .setDescription('현재 채널을 알림 채널로 지정합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.notificationKind)
        .setDescription('설정할 알림 종류입니다.')
        .setRequired(true)
        .addChoices(...notificationKindChoices),
    )
    .addRoleOption((option) =>
      option
        .setName(optionNames.mentionRole)
        .setDescription('알림 때 멘션할 관리자 역할입니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.notificationChannelList)
    .setDescription('설정된 알림 채널을 확인합니다.'),
  new SlashCommandBuilder()
    .setName(commandNames.announcementCreate)
    .setDescription('FocusAI 공지를 등록합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.title)
        .setDescription('공지 제목입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.body)
        .setDescription('공지 내용입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.tone)
        .setDescription('공지 유형입니다.')
        .setRequired(false)
        .addChoices(...toneChoices),
    )
    .addBooleanOption((option) =>
      option
        .setName(optionNames.pinned)
        .setDescription('공지를 고정합니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.announcementList)
    .setDescription('최근 공지 목록을 확인합니다.'),
  new SlashCommandBuilder()
    .setName(commandNames.announcementUpdate)
    .setDescription('공지 제목, 내용, 공지 유형, 고정 여부를 수정합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.announcementId)
        .setDescription('공지 ID입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.title)
        .setDescription('새 공지 제목입니다.')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.body)
        .setDescription('새 공지 내용입니다.')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.tone)
        .setDescription('새 공지 유형입니다.')
        .setRequired(false)
        .addChoices(...toneChoices),
    )
    .addBooleanOption((option) =>
      option
        .setName(optionNames.pinned)
        .setDescription('공지를 고정합니다.')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName(optionNames.active)
        .setDescription('공지를 활성화합니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(commandNames.announcementEnd)
    .setDescription('공지를 비활성화합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.announcementId)
        .setDescription('공지 ID입니다.')
        .setRequired(true),
    ),
].map((command) => command.toJSON())
