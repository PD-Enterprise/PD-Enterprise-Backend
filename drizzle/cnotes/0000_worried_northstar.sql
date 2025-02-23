-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "notes" (
	"note_id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"note_content" text NOT NULL,
	"subject" varchar(255) NOT NULL,
	"grade" integer NOT NULL,
	"user_email" varchar(255) NOT NULL,
	"board" varchar(255),
	"school" varchar(255),
	"date_created" date,
	"date_updated" timestamp DEFAULT now(),
	CONSTRAINT "notes_slug_key" UNIQUE("slug")
);

*/