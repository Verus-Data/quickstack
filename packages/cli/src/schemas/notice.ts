import { Schema } from "effect";

/** The one additive result field on the invocation that first shows the privacy notice. */
export const NoticeFields = { notice: Schema.optionalKey(Schema.String) };
